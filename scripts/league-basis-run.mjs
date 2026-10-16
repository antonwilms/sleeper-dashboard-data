/**
 * scripts/league-basis-run.mjs — D-46's graded before/after of the `league` scoring-basis model
 * (.claude/tasks/league-basis-mirror.md §3). Offline analysis; hand-run, never a test; no served file.
 *
 * Public exports:
 *   DECISION_RULE_MD                     the pre-registered G2 rule, written into the verdict before any G2 result is read
 *   ROOKIE_PARITY_KEYS, slimRookieSnapshot(snapshot)      the T-RM16 fixture's row slimmer (shared with its generator)
 *   recoverRookiePosition(factors), checkRookieRows(rows, opts)   G1b/G1c's per-row checks (shared with T-RM16)
 *   runG1({ load })                      G1a-d: mirror fidelity, a gate
 *   runLeagueBasis({ ... })              G1 → (gate) → G2 → G3 → verdict
 *   leagueBasisMain({ write, asJson })   the `bin/backtest.mjs --league-basis` branch body
 */
import fs from 'fs';
import { execFileSync } from 'child_process';
import { readJson, repoPath } from '../lib/io.mjs';
import { isTeamAggregateId } from '../lib/backtest.mjs';
import {
  rescoreSeasonRowsLeague, reconstructPositionBasisScale, basisRatiosByPosition, loadLeaguePositions,
  MIN_BASIS_SCALE_ROWS,
} from '../lib/leagueBasis.mjs';
import {
  applyRookieCeiling, resolveRookieCalibration, resolveRookieTotalFactor, ROOKIE_CEILING, QB_ROOKIE_STARTER_PPG,
} from '../lib/rookieMirror.mjs';
import { ROOKIE_BASELINE_PPG, reconstructBasePPG } from '../lib/projectionFactors.mjs';
import { LEAGUE_SCORING_FIXTURE, runFit } from './panel-run.mjs';
import {
  IN_SEASON_DEFAULTS, analyzeKCell, blend, bootstrapPairedMean, compareLabel, diffDynConstants,
} from '../lib/inSeasonEvidence.mjs';
import {
  runInSeason, INSEASON_LOAD, SPEC, ReconciliationStop, formatConstantsJson, ARTIFACT_CAPS, writeInSeasonArtifacts,
  buildInSeasonVerdictMarkdown,
} from './inseason-run.mjs';
import {
  runInSeasonDyn, INSEASON_DYN_LOAD, DYN_2A_PIN, classifyRow, writeInSeasonDynArtifacts, buildInSeasonDynVerdictMarkdown,
} from './inseason-dyn-run.mjs';

const r3 = (v) => Math.round(v * 1000) / 1000;
const POSITIONS = ['QB', 'RB', 'WR', 'TE'];

// ─── The pre-registered G2 decision rule (plan §3 G2) — written before any G2 result is read ─────────────────────

export const DECISION_RULE_MD = [
  '## Pre-registered decision rule (written before any G2 result was read)',
  '',
  'Per constants file, on **emitted** `k` (never `pinK(kFit)`): for each pinned points entry compare the shipped file\'s emitted `k` ' +
    'with the league file\'s emitted `k`. The out-of-sample comparison is `analyzeKCell(rows, spec, { studyK: shippedK })` on the league ' +
    'rows of the cell the entry re-derives from (`fixtureKey ?? name|pos`); its `delta` is the paired leave-one-season-out |error| ' +
    'difference (league fold k − shipped k), clustered by player with the mode\'s pinned bootstrap, labelled by `compareLabel` ' +
    '(`BEATS` = the league k is better out of sample). The shipped k keeps a small leakage advantage (fitted on all seasons).',
  '',
  '- **Excluded (basis-invariant):** `K_ROS_OPP`, `K_DYN_OPP`, `K_ROS_SHARE` — no points in prior, evidence or outcome. Listed, not pooled.',
  '- **Study entries** (`basis: \'study\'`) keep their pin rule under league and are decided like any other entry on their emitted k.',
  '- **`wire`** iff at least one points entry is `BEATS`, no points entry is `WORSE`, and the pooled points-only paired delta ' +
    '(all points entries\' rows) is `BEATS`. Otherwise **`do-not-wire`**, naming the entries.',
  '- **Multiplicity exposure:** with roughly 40 points entries at 95% intervals, one spurious `BEATS` or `WORSE` is expected by chance; ' +
    'requiring the pooled delta to be `BEATS` as well is the guard against that.',
  '- **Dynasty file (additionally):** a `wire` requires `prospectPriorKind.kind`, `decisions` and `reuse` unchanged from the shipped file ' +
    '(every difference listed with `diffDynConstants`); if any changed, the dynasty file is **`stop-and-report`** (a decision, not a k). ' +
    'The dynasty file is decided on the run paired with the 2a k the app would keep: the league 2a file if the 2a file wires, else the shipped 2a file.',
  '- **Data-quality signal:** report `scaled` weeks above 0.5% of the G2 rows in any season.',
  '- **G3 is report-only:** no exponent is activated; any label difference between bases means the committed `r3fit-exponent-harness.md` ' +
    'verdict does not transport to league basis (Session 1 records a backlog item).',
  '',
].join('\n');

// ─── G1b / G1c — rookie-row checks (shared with test/rookie-mirror.test.mjs T-RM16) ───────────────────────────────

/** The rookie keys the parity checks read: T-RM10's list plus D-46's scale, product, total, takeover and starter keys. */
export const ROOKIE_PARITY_KEYS = [
  'basePPG', 'draftCapitalStatus', 'nflDraftTier',
  'rookieCalibrationMult', 'rookieCalibrationBasis', 'rookieGamesBasis',
  'rookieCeilingBasis', 'rookieCeilingKnee', 'rookieCeilingAsymptote', 'rookieCeilingPPGPre',
  'rookieBasisScale', 'rookieMultiplierProduct', 'rookieTotalFactor', 'rookieTotalBasis',
  'qbTakeoverBasis', 'qbStartShare', 'qbStarterPPG', 'qbStarterBasis',
];

/** A snapshot's rookie-path rows (`confidence === 'rookie'`), slimmed to ROOKIE_PARITY_KEYS — the T-RM16 fixture shape. */
export function slimRookieSnapshot(snapshot) {
  const slim = {
    schemaVersion: snapshot.schemaVersion, capturedAt: snapshot.capturedAt,
    targetSeason: snapshot.targetSeason, currentSeason: snapshot.currentSeason,
    projectionBasis: snapshot.projectionBasis ?? null, projectionModelFrom: snapshot.projectionModelFrom ?? null,
    players: {},
  };
  for (const [pid, p] of Object.entries(snapshot.players ?? {})) {
    const proj = p.projection;
    if (!proj || proj.confidence !== 'rookie') continue;
    const factors = {};
    for (const k of ROOKIE_PARITY_KEYS) if (proj.factors?.[k] !== undefined) factors[k] = proj.factors[k];
    slim.players[pid] = { projection: {
      projectedPPG: proj.projectedPPG, projectedGames: proj.projectedGames, projectedTotalPts: proj.projectedTotalPts, factors,
    } };
  }
  return slim;
}

/**
 * Recover a rookie row's position from `basePPG / rookieBasisScale ∈ ROOKIE_BASELINE_PPG` (post-switch basePPG is
 * baseline × scale; pre-switch rows carry no scale and recover from basePPG directly — scale 1). WR's baseline 7 is also
 * the default for an unrecognised position, broken by a null ceiling knee (T-RM10's rule). → { position, scale } | null.
 */
export function recoverRookiePosition(factors) {
  const scale = factors.rookieBasisScale ?? 1;
  for (const position of POSITIONS) {
    if (Math.abs(factors.basePPG - r3(ROOKIE_BASELINE_PPG[position] * scale)) >= 1e-9) continue;
    if (position === 'WR' && factors.rookieCeilingKnee !== ROOKIE_CEILING.WR.knee * scale) return null;
    return { position, scale };
  }
  return null;
}

const FIELD_NAMES = ['basePPG', 'ceilingInput', 'kneeAsymptote', 'level', 'qbStarter', 'totalFactor', 'total'];

/**
 * Mirror one snapshot's rookie rows under a scoring-basis model.
 *   rows: [[pid, { projectedPPG, projectedGames, projectedTotalPts, factors }]]  (a slimRookieSnapshot's `players` entries)
 *   scaleOf(position, factors) → the scale the model applies (captured scale, the model's own reconstruction, or 1)
 *   rookieQbModel / rookieTotalModel: 'legacy' skips the qbStarter / total-factor checks the capture predates.
 * `qbTakeoverBasis: 'chain'` rows are excluded from the level/total assertions (the CR-15 Mirror: the reconstruction does not
 * compose share × level) and counted. Returns per-field { checked, fail } plus position-recovery and consistency counts.
 */
export function checkRookieRows(rows, { scaleOf, rookieQbModel = 'rookie-qb-level', rookieTotalModel = 'rookie-total' }) {
  const fields = Object.fromEntries(FIELD_NAMES.map(n => [n, { checked: 0, fail: 0, failures: [] }]));
  const out = {
    rows: rows.length, positionUnrecovered: 0, chainExcluded: 0, byPosition: {},
    capturedCeilingInputConsistent: 0, productDp2: 0, productDp3: 0, levelExact: 0, totalExact: 0, fields,
  };
  const note = (name, pid, ok, detail) => {
    const f = fields[name];
    f.checked++;
    if (!ok) { f.fail++; if (f.failures.length < 5) f.failures.push({ pid, ...detail }); }
  };
  for (const [pid, p] of rows) {
    const { factors, projectedPPG, projectedGames, projectedTotalPts } = p.projection;
    const rec = recoverRookiePosition(factors);
    if (rec == null) { out.positionUnrecovered++; continue; }
    const { position } = rec;
    out.byPosition[position] = (out.byPosition[position] ?? 0) + 1;
    const scale = scaleOf(position, factors);

    // basePPG = round3(baseline × scale)
    const wantBase = r3(ROOKIE_BASELINE_PPG[position] * scale);
    note('basePPG', pid, Math.abs(wantBase - factors.basePPG) < 1e-9, { position, mirror: wantBase, captured: factors.basePPG });

    // rookieCeilingPPGPre is a captured INPUT (ktc/college are held at 1.0 in the mirror, so it cannot be rebuilt); check it
    // equals baseline × captured product × calibration at 3 dp. Model-independent capture consistency counted separately.
    const calib = resolveRookieCalibration({ position, draftCapitalStatus: factors.draftCapitalStatus, nflDraftTier: factors.nflDraftTier });
    const preOf = (base) => r3(Math.min(Math.max(base * factors.rookieMultiplierProduct * calib.rookieCalibrationMult, 0), 40));
    if (Math.abs(preOf(factors.basePPG) - factors.rookieCeilingPPGPre) < 1e-9) out.capturedCeilingInputConsistent++;
    if (Math.abs(Math.round(factors.rookieMultiplierProduct * 100) / 100 - factors.rookieMultiplierProduct) < 1e-9) out.productDp2++; else out.productDp3++;
    // `rookieMultiplierProduct` is captured at 2-3 dp, so the 3-dp equality holds only where that rounding is benign; the check is
    // against the rounding bound of the captured product (half a unit at 2 dp × baseline × calibration, plus the 3-dp capture of the input).
    const baseM = ROOKIE_BASELINE_PPG[position] * scale;
    const unclamped = baseM * factors.rookieMultiplierProduct * calib.rookieCalibrationMult;
    const wantPre = Math.min(Math.max(unclamped, 0), 40);
    const tol = 0.005 * baseM * calib.rookieCalibrationMult + 5e-4;
    note('ceilingInput', pid, Math.abs(wantPre - factors.rookieCeilingPPGPre) <= tol, { position, mirror: r3(wantPre), captured: factors.rookieCeilingPPGPre, tol: r3(tol) });

    // From the captured input: knee/asymptote exact (scaled constants), the ceiled level
    const ceiling = applyRookieCeiling({ position, projectedPPG: factors.rookieCeilingPPGPre, basisScale: scale });
    note('kneeAsymptote', pid,
      ceiling.rookieCeilingKnee === factors.rookieCeilingKnee && ceiling.rookieCeilingAsymptote === factors.rookieCeilingAsymptote,
      { position, mirror: [ceiling.rookieCeilingKnee, ceiling.rookieCeilingAsymptote], captured: [factors.rookieCeilingKnee, factors.rookieCeilingAsymptote] });

    const chain = factors.qbTakeoverBasis === 'chain';
    if (chain) out.chainExcluded++;

    if (!chain) {
      const rounded = Math.round(ceiling.ceiledPPG * 10) / 10;
      const diff = Math.abs(rounded - projectedPPG);
      if (diff === 0) out.levelExact++;
      note('level', pid, diff <= 0.1 + 1e-9, { position, mirror: rounded, captured: projectedPPG });
    }

    // qbStarterPPG on rookie:* rows = round3(QB_ROOKIE_STARTER_PPG[g] × scale) (T-QB-4's rule); 'projection' rows = round3(ceiled)
    if (rookieQbModel === 'rookie-qb-level' && position === 'QB' && typeof factors.qbStarterBasis === 'string') {
      const m = /^rookie:(.+)$/.exec(factors.qbStarterBasis);
      const want = m ? r3(QB_ROOKIE_STARTER_PPG[m[1]] * scale) : r3(ceiling.ceiledPPG);
      note('qbStarter', pid, Math.abs(want - factors.qbStarterPPG) < 1e-9, { basis: factors.qbStarterBasis, mirror: want, captured: factors.qbStarterPPG });
    }

    // projectedTotalPts with rookieTotalFactor (boundary 9)
    if (!chain) {
      let factor = 1;
      if (rookieTotalModel === 'rookie-total') {
        const tf = resolveRookieTotalFactor({ position, draftCapitalStatus: factors.draftCapitalStatus, nflDraftTier: factors.nflDraftTier });
        factor = tf.rookieTotalFactor;
        note('totalFactor', pid, tf.rookieTotalFactor === factors.rookieTotalFactor && tf.rookieTotalBasis === factors.rookieTotalBasis,
          { position, mirror: [tf.rookieTotalFactor, tf.rookieTotalBasis], captured: [factors.rookieTotalFactor, factors.rookieTotalBasis] });
      }
      const total = Math.round(ceiling.ceiledPPG * projectedGames * factor * 10) / 10;
      const td = Math.abs(total - projectedTotalPts);
      if (td === 0) out.totalExact++;
      note('total', pid, td <= 0.1 + 1e-9, { position, mirror: total, captured: projectedTotalPts });
    }
  }
  out.mismatchTotal = FIELD_NAMES.reduce((a, n) => a + fields[n].fail, 0);
  return out;
}

// ─── G1 ───────────────────────────────────────────────────────────────────────────────────────────────────────────

export const G1_DEFAULTS = Object.freeze({
  parityCaptures: ['2026-09-25', '2026-10-14'],     // G1a / G1b (post-switch)
  boundaryCaptures: { pre: '2026-09-24', post: '2026-09-25' },   // G1c
  bFixtureCapture: '2026-10-14',
  firstSeason: 2012, lastSeason: 2025, scaleSeason: 2026,
});

export const LEAGUE_LOAD = {
  loadSeasonTotals: (y) => readJson(`nfl/season-totals/${y}.json`),
  loadSnapshot: (d) => readJson(`snapshots/${d}.json`),
  loadLeagueScoring: () => readJson(LEAGUE_SCORING_FIXTURE),
  loadPlayersMapPosition: () => loadLeaguePositions(),
};

const deepEqual = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/** Models per capture (D5): projectionBasis 'league' → league; absent or 'half_ppr' → half_ppr; else skip with a reason. */
export function modelOfCapture(snapshot) {
  const b = snapshot.projectionBasis;
  if (b === 'league') return { model: 'league' };
  if (b === undefined || b === null || b === 'half_ppr') return { model: 'half_ppr' };
  return { model: null, reason: `projectionBasis '${b}' — no model reproduces it (mixed/unknown)` };
}

/**
 * G1: mirror fidelity (a gate). `positionOf` is the D3 position source (the players export, or its players-state overlay).
 * Returns { pass, a, b, c, d, scaleByPosition, ... }; never throws on a parity miss — the caller stops on `pass === false`.
 */
export function runG1({ load = LEAGUE_LOAD, positionOf = null, positionFile = 'raw/-players-nfl.json', log = () => {}, defaults = G1_DEFAULTS } = {}) {
  const settings = load.loadLeagueScoring();
  positionOf = positionOf ?? load.loadPlayersMapPosition();

  // D2: the pinned settings are deep-equal on every capture read for parity
  const captures = {};
  const settingsEqual = {};
  for (const d of [defaults.boundaryCaptures.pre, ...defaults.parityCaptures]) {
    captures[d] = load.loadSnapshot(d);
    settingsEqual[d] = deepEqual(sortKeys(captures[d].scoringSettings), sortKeys(settings));
  }
  const settingsAllEqual = Object.values(settingsEqual).every(Boolean);

  // The rescored seasons 2012…2025 (the as-of scale for S = 2026 reads exactly these)
  const rawBySeason = {};
  const rescored = {};
  for (let y = defaults.firstSeason; y <= defaults.lastSeason; y++) {
    rawBySeason[y] = load.loadSeasonTotals(y);
    rescored[y] = rescoreSeasonRowsLeague(rawBySeason[y], settings, positionOf);
  }
  const scale = reconstructPositionBasisScale(rescored, positionOf);
  const ratios = basisRatiosByPosition(rescored, positionOf);
  const qualifyingRows = Object.fromEntries(POSITIONS.map(p => [p, ratios[p].length]));

  // D3 — pids absent from the position export (qualifying history), and the position diff on the capture's rookies
  const absentQualifying = new Set();
  for (const y of Object.keys(rescored)) {
    for (const [pid, row] of Object.entries(rescored[y] ?? {})) {
      if ((row?.gamesPlayed ?? 0) >= 10 && row.sourceScoringBasis === 'half_ppr' && positionOf(pid) == null) absentQualifying.add(pid);
    }
  }

  // G1a — the scale equals the captured rookieBasisScale of every rookie-path row, per recovered position
  const a = { captures: {}, pass: true };
  for (const d of defaults.parityCaptures) {
    const slim = slimRookieSnapshot(captures[d]);
    const per = Object.fromEntries(POSITIONS.map(p => [p, { rows: 0, captured: new Set(), exportDiff: 0, exportAbsent: 0 }]));
    let unrecovered = 0;
    for (const [pid, p] of Object.entries(slim.players)) {
      const rec = recoverRookiePosition(p.projection.factors);
      if (rec == null) { unrecovered++; continue; }
      const e = per[rec.position];
      e.rows++;
      e.captured.add(p.projection.factors.rookieBasisScale);
      const ex = positionOf(pid);
      if (ex == null) e.exportAbsent++; else if (ex !== rec.position) e.exportDiff++;
    }
    const out = {};
    for (const p of POSITIONS) {
      const e = per[p];
      const cap = [...e.captured];
      const match = cap.length === 1 && cap[0] === scale[p];
      out[p] = { rows: e.rows, captured: cap, mirror: scale[p], match, qualifyingRows: qualifyingRows[p], exportPositionDiff: e.exportDiff, exportAbsent: e.exportAbsent };
      if (!match) a.pass = false;
    }
    a.captures[d] = { unrecovered, byPosition: out };
    if (unrecovered) a.pass = false;
  }

  // G1b — rookie rows, post-switch, under league (captured scale) and under half_ppr (scale 1: the "before")
  const bSlim = slimRookieSnapshot(captures[defaults.bFixtureCapture]);
  const bRows = Object.entries(bSlim.players);
  const b = {
    capture: defaults.bFixtureCapture,
    league: checkRookieRows(bRows, { scaleOf: (pos, f) => f.rookieBasisScale ?? 1 }),
    half_ppr: checkRookieRows(bRows, { scaleOf: () => 1 }),
  };
  b.pass = b.league.mismatchTotal === 0 && b.league.positionUnrecovered === 0;

  // G1c — the boundary: 09-24 (legacy models, no scale) passes under half_ppr and fails under league; 09-25 the reverse.
  // Under league the model's own reconstructed scale is applied (G1a proves it equals the captured one).
  const c = { captures: {} };
  for (const [side, d] of Object.entries(defaults.boundaryCaptures)) {
    const rows = Object.entries(slimRookieSnapshot(captures[d]).players);
    const legacy = { rookieQbModel: 'legacy', rookieTotalModel: 'legacy' };
    c.captures[d] = {
      side, model: modelOfCapture(captures[d]),
      half_ppr: summarize(checkRookieRows(rows, { scaleOf: () => 1, ...legacy })),
      league: summarize(checkRookieRows(rows, { scaleOf: (pos) => scale[pos], ...legacy })),
    };
  }
  const pre = c.captures[defaults.boundaryCaptures.pre], post = c.captures[defaults.boundaryCaptures.post];
  c.pass = pre.half_ppr.mismatchTotal === 0 && pre.league.mismatchTotal > 0 && post.league.mismatchTotal === 0 && post.half_ppr.mismatchTotal > 0;

  // G1d — veteran basePPG on the b capture under league rows (and half-PPR rows: the "before")
  const d = runG1d({ snapshot: captures[defaults.bFixtureCapture], rescored, rawBySeason, defaults });

  const pass = settingsAllEqual && a.pass && b.pass && c.pass && d.pass;
  log(`G1 ${pass ? 'PASS' : 'FAIL'}: settings ${settingsAllEqual} · a ${a.pass} · b ${b.pass} · c ${c.pass} · d ${d.pass}`);
  return {
    pass, positionFile, settingsEqual, scaleSeason: defaults.scaleSeason, scaleByPosition: scale, qualifyingRows,
    absentQualifyingPids: absentQualifying.size, a, b, c, d,
  };
}

function summarize(check) {
  return { rows: check.rows, positionUnrecovered: check.positionUnrecovered, chainExcluded: check.chainExcluded, mismatchTotal: check.mismatchTotal,
    byField: Object.fromEntries(FIELD_NAMES.map(n => [n, { checked: check.fields[n].checked, fail: check.fields[n].fail }])) };
}

function sortKeys(o) { return Object.fromEntries(Object.entries(o ?? {}).sort(([x], [y]) => (x < y ? -1 : 1))); }

/** The veteran candidates the T-F10 generator uses: pipelinePPG present and momentumLabel defined (non-rookie rows). */
export function veteranCandidatePids(snapshot) {
  return Object.entries(snapshot.players ?? {})
    .filter(([, p]) => p.projection?.factors?.pipelinePPG != null && p.projection.factors.momentumLabel !== undefined)
    .map(([pid]) => pid);
}

/** One veteran row's basePPG (1 dp) from a { season: { gamesPlayed, fantasyPoints } } career — T-F10's qualifying rule. */
export function veteranBasePPG(career) {
  const qualifying = [];
  for (const s of Object.keys(career).map(Number).sort((x, y) => x - y)) {
    const rec = career[s];
    const gp = rec.gamesPlayed ?? 0, fp = rec.fantasyPoints;
    if (gp >= 8 && Number.isFinite(fp)) qualifying.push({ season: s, ppg: fp / gp, gamesPlayed: gp });
  }
  if (qualifying.length === 0) return { basePPG: null, qualifying };
  return { basePPG: Math.round(reconstructBasePPG(qualifying) * 10) / 10, qualifying };
}

function runG1d({ snapshot, rescored, rawBySeason, defaults }) {
  const pids = veteranCandidatePids(snapshot);
  const careerOf = (bySeason, pid) => {
    const c = {};
    for (let y = defaults.firstSeason; y <= defaults.lastSeason; y++) if (bySeason[y]?.[pid]) c[y] = bySeason[y][pid];
    return c;
  };
  const counts = { candidates: pids.length, noQualifying: 0, league: { match: 0 }, half_ppr: { match: 0 }, consistencyScore: { league: 0, half_ppr: 0, checked: 0 }, outlierRatio: { league: 0, half_ppr: 0, checked: 0 } };
  const rateOf = (career) => {
    const { qualifying } = veteranBasePPG(career);
    if (!qualifying.length) return null;
    const ppgs = qualifying.map(q => q.ppg), mean = ppgs.reduce((x, y) => x + y, 0) / ppgs.length;
    const lastQ = qualifying[qualifying.length - 1];
    let consistencyScore = null;
    if (ppgs.length >= 3) {
      const sd = Math.sqrt(ppgs.reduce((s, v) => s + (v - mean) ** 2, 0) / (ppgs.length - 1));
      const cv = mean > 0 ? sd / mean : 1;
      consistencyScore = Math.round(Math.max(0, Math.min(100, 100 - cv * 100)));
    }
    return { consistencyScore, outlierRatio: lastQ.ppg / Math.max(mean, 1) };
  };
  const misses = [];
  for (const pid of pids) {
    const f = snapshot.players[pid].projection.factors;
    const cl = careerOf(rescored, pid), ch = careerOf(rawBySeason, pid);
    const bl = veteranBasePPG(cl), bh = veteranBasePPG(ch);
    if (bl.basePPG == null) { counts.noQualifying++; continue; }
    if (bl.basePPG === f.basePPG) counts.league.match++; else if (misses.length < 5) misses.push({ pid, captured: f.basePPG, league: bl.basePPG });
    if (bh.basePPG === f.basePPG) counts.half_ppr.match++;
    const rl = rateOf(cl), rh = rateOf(ch);
    counts.consistencyScore.checked++; counts.outlierRatio.checked++;
    if (rl.consistencyScore === f.consistencyScore) counts.consistencyScore.league++;
    if (rh.consistencyScore === f.consistencyScore) counts.consistencyScore.half_ppr++;
    if (Math.abs(Math.round(rl.outlierRatio * 100) / 100 - f.outlierRatio) < 1e-9) counts.outlierRatio.league++;
    if (Math.abs(Math.round(rh.outlierRatio * 100) / 100 - f.outlierRatio) < 1e-9) counts.outlierRatio.half_ppr++;
  }
  counts.misses = misses;
  counts.pass = counts.league.match === counts.candidates - counts.noQualifying;
  counts.note = '`isTdReliant` has no data-side mirror (reported as unreconstructed); consistencyScore / outlierRatio are match rates, not asserted.';
  return counts;
}


// ─── G2 — the k re-fit: compare emitted k, out of sample, per pinned entry ───────────────────────────────────────

/** The files the app pins today (`IN_SEASON_CONSTANTS_SOURCE` / `IN_SEASON_DYN_CONSTANTS_SOURCE`); the commits are asserted. */
export const SHIPPED_FILES = Object.freeze({
  twoA: Object.freeze({ path: 'backtests/2026-10-07-inseason-constants.json', commit: 'f2c3b83b31acc589dac78b6d61a704ac02a57477' }),
  dyn: Object.freeze({ path: 'backtests/2026-10-11-inseason-dyn-constants.json', commit: '037047811eae63a522b23de69cb9dcbc8bc2cc4d' }),
});

/** No points in prior, evidence or outcome — excluded from the decision, listed (the opp/share family incl. the stale-baseline opp k). */
export const BASIS_INVARIANT_ENTRIES = Object.freeze(['K_ROS_OPP', 'K_DYN_OPP', 'K_ROS_SHARE', 'K_ROS_OPP_STALE']);

/** git: the last commit touching each shipped file equals the one the app names (read-only; the hand-run asserts it). */
export function shippedCommitsMatch(files = SHIPPED_FILES) {
  const out = {};
  for (const [k, f] of Object.entries(files)) {
    let last = null;
    try {
      last = execFileSync('git', ['log', '-1', '--format=%H', '--', f.path], { cwd: repoPath('.'), encoding: 'utf8' }).trim() || null;
    } catch { last = null; }
    out[k] = { path: f.path, expected: f.commit, last, match: last === f.commit };
  }
  return out;
}

const sameK = (a, b) => (a == null && b == null) || (a != null && b != null && a === b);

/** The analysis spec of a 2a store key (`pinnedFrom` names the key an entry re-derives from). */
export function specForStoreKey(key) {
  if (key.startsWith('pointsP_ros|')) return SPEC.pointsRos;
  if (key.startsWith('pointsP_next|')) return SPEC.pointsNext;
  if (key.startsWith('pointsR_next|')) return SPEC.rawNext;
  if (key.startsWith('pointsR_ros|')) return SPEC.rawRos;
  if (key.startsWith('q7_L|')) return { prior: 'pointsPriorLive', obs: 'obsPPG', outcome: 'rosPPG' };
  const m = /^q[34]\|(?:[^|]+\|)?(ros|next)\|/.exec(key);
  if (key.startsWith('q3|') && /^q3\|(ros|next)\|/.test(key)) return key.startsWith('q3|ros|') ? SPEC.pointsRos : SPEC.pointsNext;
  if (key.startsWith('q4|') && m) return m[1] === 'ros' ? SPEC.pointsRos : SPEC.pointsNext;
  return null;
}

/** A 2a cell resolver over the league run's store: the cell an entry re-derives from (fixtureKey ?? name|pos → the pinnedFrom key). */
export function twoACellResolver({ store, pinnedFrom }) {
  return (name, cell) => {
    const from = pinnedFrom[`${name}|${cell}`];
    if (typeof from !== 'string') return null;
    const key = from.split(' ')[0];
    const a = store.get(key);
    const spec = specForStoreKey(key);
    if (!a || !a.orderedRows || !spec) return null;
    return { cellKey: key, rows: a.orderedRows, spec };
  };
}

/** The dynasty cell resolver: K_DYN_PROSPECT_* cells over the league dyn run's Q1 rows (arm A / arm B, YE0 / YE1, pooled or one position). */
export function dynCellResolver(allRows) {
  const q1 = allRows.filter(r => classifyRow(r).q1);
  const SPEC_A = { prior: 'prospectPrior', obs: 'obsPPG', outcome: 'nextPPG' };
  const SPEC_B = { prior: 'projPrior', obs: 'obsPPG', outcome: 'nextPPG' };
  return (name, cell, entry) => {
    const m = /^K_DYN_PROSPECT_(B_)?(?:A_)?YE([01])$/.exec(name);
    if (!m) return null;
    const ye = Number(m[2]);
    const spec = m[1] ? SPEC_B : SPEC_A;
    const pooled = entry?.fixtureKey != null;
    const rows = q1.filter(r => r.ye === ye && (pooled || r.position === cell));
    return { cellKey: pooled ? entry.fixtureKey : `${name}|${cell}`, rows, spec };
  };
}

const wkMethodCounts = (rows, rescoredBy) => {
  const seen = new Set();
  const out = { exact: 0, scaled: 0, none: 0 };
  for (const r of rows) {
    const key = `${r.sleeperId}|${r.S}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const m = rescoredBy(r.S)?.[r.sleeperId]?.weeklyPointsMethod;
    if (m === 'exact') out.exact++; else if (m === 'scaled') out.scaled++; else out.none++;
  }
  return out;
};

/**
 * Per entry: shipped emitted k/basis, league emitted k/basis, rows, players, the paired LOSO delta (league fold k − shipped k on
 * the league rows of the entry's cell, clustered by player, the mode's pinned bootstrap) and its label; `same` when the emitted k are
 * identical (the delta is still reported). `pooled` is the paired delta over every points entry's rows (deduplicated per
 * cell × shipped k, so a pooled cell shared by four positions counts once).
 */
export function compareConstantsFiles({ shipped, league, cellOf, rescoredBy = () => null, bootstrap = IN_SEASON_DEFAULTS.bootstrap }) {
  const names = [...new Set([...Object.keys(shipped.constants ?? {}), ...Object.keys(league.constants ?? {})])];
  const entries = [];
  const analysisCache = new Map();
  const pooledParts = new Map();
  const differingKeys = new Set();
  for (const name of names) {
    const cells = [...new Set([...Object.keys(shipped.constants?.[name] ?? {}), ...Object.keys(league.constants?.[name] ?? {})])];
    for (const cell of cells) {
      const s = shipped.constants?.[name]?.[cell] ?? null, l = league.constants?.[name]?.[cell] ?? null;
      const row = {
        name, cell, excluded: BASIS_INVARIANT_ENTRIES.includes(name),
        shipped: s ? { k: s.k, basis: s.basis } : null,
        league: l ? { k: l.k, basis: l.basis, kFit: l.kFit, rows: l.rows, players: l.players, fixtureKey: l.fixtureKey ?? null } : null,
        study: s?.basis === 'study' || l?.basis === 'study',
        same: s && l ? sameK(s.k, l.k) : null, cellKey: null, delta: null, label: null, weeksMethod: null,
      };
      entries.push(row);
      if (row.excluded) { row.label = 'excluded'; continue; }
      if (!s || !l) { row.label = s ? 'league-missing' : 'shipped-missing'; continue; }
      const c = cellOf(name, cell, l);
      if (!c) { row.label = 'no-cell'; continue; }
      row.cellKey = c.cellKey;
      if (typeof s.k !== 'number') { row.label = row.same ? 'same' : 'no-shipped-k'; continue; }
      const ckey = `${c.cellKey}|${s.k}`;
      let a = analysisCache.get(ckey);
      if (a === undefined) {
        a = analyzeKCell(c.rows, c.spec, { studyK: s.k, bootstrap, ci: false });
        analysisCache.set(ckey, a);
        if (a.verdict !== 'INSUFFICIENT') {
          const diffs = a.orderedRows.map((r, i) => Math.abs(a.heldOut[i].pred - a.heldOut[i].actual)
            - Math.abs(blend(r[c.spec.prior], r[c.spec.obs], r.n, s.k) - r[c.spec.outcome]));
          pooledParts.set(ckey, { ids: a.orderedRows.map(r => r.sleeperId), diffs });
        }
      }
      row.rowsUsed = a.rows;
      if (!row.same) differingKeys.add(ckey);
      if (a.verdict === 'INSUFFICIENT' || !a.delta) { row.label = row.same ? 'same' : 'INSUFFICIENT'; continue; }
      row.delta = { mean: a.delta.mean, ci95: a.delta.ci95, label: a.delta.label };
      row.label = row.same ? 'same' : a.delta.label;
      row.weeksMethod = wkMethodCounts(c.rows, rescoredBy);
    }
  }
  const poolOf = (parts) => {
    const ids = [], diffs = [];
    for (const part of parts) { ids.push(...part.ids); diffs.push(...part.diffs); }
    if (!diffs.length) return null;
    const b = bootstrapPairedMean(ids, diffs, bootstrap);
    return {
      cells: parts.length, rows: diffs.length, players: new Set(ids).size,
      mean: b ? diffs.reduce((x, y) => x + y, 0) / diffs.length : null, ci95: b?.ci95 ?? null, label: b ? compareLabel(b.ci95) : null,
    };
  };
  const pooled = poolOf([...pooledParts.values()]);
  // Disclosure only (never the decision): the same pool restricted to cells where at least one entry's emitted k differs.
  const pooledDiffering = poolOf([...pooledParts].filter(([key]) => differingKeys.has(key)).map(([, part]) => part));
  return { entries, pooled, pooledDiffering };
}

/** The pre-registered per-file rule (plan §3 G2). Never reads the narrative — only the labels. */
export function decideFile({ comparison, kind = '2a', structural = null }) {
  const points = comparison.entries.filter(e => !e.excluded && e.cellKey != null);
  const beats = points.filter(e => e.label === 'BEATS').map(e => `${e.name}.${e.cell}`);
  const worse = points.filter(e => e.label === 'WORSE').map(e => `${e.name}.${e.cell}`);
  const pooledBeats = comparison.pooled?.label === 'BEATS';
  const ruleWires = beats.length > 0 && worse.length === 0 && pooledBeats;
  const out = {
    pointsEntries: points.length, differing: points.filter(e => e.label !== 'same' && e.label !== 'excluded').length,
    beats, worse, pooledLabel: comparison.pooled?.label ?? null, ruleWires,
  };
  if (kind === 'dyn' && structural && structural.changed) {
    out.verdict = ruleWires ? 'stop-and-report' : 'do-not-wire';
    out.structural = structural;
  } else {
    out.verdict = ruleWires ? 'wire' : 'do-not-wire';
  }
  out.reason = out.verdict === 'wire'
    ? `BEATS: ${beats.join(', ')}; no WORSE; pooled points delta BEATS`
    : `${beats.length ? `BEATS ${beats.join(', ')}` : 'no BEATS entry'}; ${worse.length ? `WORSE ${worse.join(', ')}` : 'no WORSE entry'}; pooled points delta ${comparison.pooled?.label ?? 'n/a'}${out.structural ? '; structure changed (kind / decisions / reuse)' : ''}`;
  return out;
}

/** Dynasty structure: `prospectPriorKind.kind`, `decisions` and `reuse` unchanged from the shipped file (every difference listed). */
export function dynStructure({ shipped, league }) {
  const diff = diffDynConstants(league, shipped);
  const kindEqual = deepEqual(league.prospectPriorKind?.kind ?? null, shipped.prospectPriorKind?.kind ?? null);
  const decisionsChanged = diff.changed.filter(c => c.path.startsWith('decisions'));
  const reuseChanged = diff.changed.filter(c => c.path.startsWith('reuse'));
  return {
    diff: diff.changed, kindEqual, kind: { shipped: shipped.prospectPriorKind?.kind ?? null, league: league.prospectPriorKind?.kind ?? null },
    decisionsChanged, reuseChanged,
    changed: !kindEqual || decisionsChanged.length > 0 || reuseChanged.length > 0,
  };
}

// ─── G3 — R3-FIT transport (report-only) ──────────────────────────────────────────────────────────────────────────

/** Per-position (and the WR+TE pool) verdict labels and fitted exponents from a runFit fitReport. */
export function fitSummary(fitReport) {
  const rowOf = (r) => ({
    verdict: r.verdict, baseVerdict: r.baseVerdict ?? null, sensitivityVerdict: r.sensitivityVerdict ?? null,
    exponents: r.wFinal ?? null, nFitRows: r.nFitRows, nEvalRows: r.nEvalRows,
  });
  return {
    perPosition: Object.fromEntries(POSITIONS.map(p => [p, rowOf(fitReport.perPosition[p])])),
    pool: fitReport.pool?.WRTE ? { WRTE: rowOf(fitReport.pool.WRTE) } : null,
  };
}

/** Side by side: any verdict/baseVerdict/sensitivityVerdict difference means the committed verdict does not transport. */
export function g3Table(halfPpr, league) {
  const rows = [];
  const add = (label, h, l) => {
    const factors = [...new Set([...Object.keys(h.exponents ?? {}), ...Object.keys(l.exponents ?? {})])];
    rows.push({
      position: label, half_ppr: { verdict: h.verdict, baseVerdict: h.baseVerdict, sensitivityVerdict: h.sensitivityVerdict },
      league: { verdict: l.verdict, baseVerdict: l.baseVerdict, sensitivityVerdict: l.sensitivityVerdict },
      labelDiffers: h.verdict !== l.verdict || h.baseVerdict !== l.baseVerdict || h.sensitivityVerdict !== l.sensitivityVerdict,
      exponents: Object.fromEntries(factors.map(f => [f, { half_ppr: h.exponents?.[f] ?? null, league: l.exponents?.[f] ?? null }])),
    });
  };
  for (const p of POSITIONS) add(p, halfPpr.perPosition[p], league.perPosition[p]);
  if (halfPpr.pool?.WRTE && league.pool?.WRTE) add('WRTE', halfPpr.pool.WRTE, league.pool.WRTE);
  return { rows, anyLabelDiffers: rows.some(r => r.labelDiffers) };
}

// ─── Orchestration ────────────────────────────────────────────────────────────────────────────────────────────────

const IN_MEMORY_2A = 'backtests/<in-memory league 2a file>';

function stubMarkdown(generatedAt, headRev) {
  return [
    '# D-46 — league-basis mirror: graded before/after (verdict)', '',
    `Pre-registration written ${generatedAt} (data \`${headRev}\`), **before any G2 result was read**; G1 (a gate) runs after this write and G2 only if it passes. ` +
      'This file is overwritten by the full verdict at the end of the run.', '',
    DECISION_RULE_MD,
  ].join('\n') + '\n';
}

const gitHead = () => { try { return execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: repoPath('.'), encoding: 'utf8' }).trim(); } catch { return 'unknown'; } };

/** Scaled-vs-exact weeks per season over the rescored player rows, TEAM_* pseudo-rows excluded (plan §7: report `scaled` > 0.5% of weeks in any season). */
export function weeksMethodBySeason(load, from = 2012, to = 2025) {
  const out = {};
  for (let S = from; S <= to; S++) {
    const rows = load.loadSeasonTotals(S);
    const c = { rows: 0, exactWeeks: 0, scaledWeeks: 0, noWeeksRows: 0 };
    for (const [pid, r] of Object.entries(rows ?? {})) {
      if (r == null || typeof r !== 'object') continue;
      if (isTeamAggregateId(pid)) continue;   // TEAM_* pseudo-rows carry no weeklyStats and are never evidence rows
      c.rows++;
      const n = r.weeklyPoints == null ? 0 : (Array.isArray(r.weeklyPoints) ? r.weeklyPoints.length : Object.keys(r.weeklyPoints).length);
      if (r.weeklyPointsMethod === 'exact') c.exactWeeks += n;
      else if (r.weeklyPointsMethod === 'scaled') c.scaledWeeks += n;
      else c.noWeeksRows++;
    }
    const tot = c.exactWeeks + c.scaledWeeks;
    c.scaledShare = tot ? c.scaledWeeks / tot : null;
    c.flag = c.scaledShare != null && c.scaledShare > 0.005;
    out[S] = c;
  }
  return out;
}

function qbChainShares(coverage) {
  return (coverage?.qbStart?.seasons ?? []).map(s => ({ S: s.S, teams: s.teams, incumbent: s.incumbent, chain: s.chain, stale: s.stale, noChart: s.noChart, medianChainShare: s.medianChainShare }));
}

export function runLeagueBasis({
  load = INSEASON_DYN_LOAD, write = false, log = () => {}, positionOf = null,
  fit = runFit, writers = {}, g1Result = null,
} = {}) {
  const t0 = Date.now();
  const generatedAt = new Date().toISOString();
  const date = generatedAt.slice(0, 10);
  const verdictPath = `grading/${date}-league-basis-verdict.md`;
  const panelPath = `backtests/${date}-league-basis-panel.json`;
  const writeText = (rel, text) => { fs.mkdirSync(repoPath(rel.split('/')[0]), { recursive: true }); fs.writeFileSync(repoPath(rel), text, 'utf8'); };

  // Pre-registration: the rule is in the verdict file before anything is read.
  if (write) writeText(verdictPath, stubMarkdown(generatedAt, gitHead()));

  log('G1 …');
  const g1 = g1Result ?? runG1({ positionOf, log });   // g1Result: injected by tests (the real G1 reads snapshots/)
  if (!g1.pass) return { stopped: 'G1', generatedAt, g1 };

  const shipped2a = readJson(SHIPPED_FILES.twoA.path);
  const shippedDyn = readJson(SHIPPED_FILES.dyn.path);
  const commits = shippedCommitsMatch();

  // G2 step 1 — --inseason --basis league
  log('G2 step 1: --inseason --basis league …');
  let hook = null;
  const r2a = runInSeason({ load, basis: 'league', onStore: (h) => { hook = h; }, log: (m) => log(`[2a] ${m}`) });
  let path2a = IN_MEMORY_2A;
  let w2a = null;
  if (write) {
    w2a = (writers.twoA ?? writeInSeasonArtifacts)({ result: r2a, verdictMd: buildInSeasonVerdictMarkdown(r2a) });
    path2a = w2a.constantsPath;
  }
  const leagueLoad = hook.load;
  const rescoredBy = (S) => leagueLoad.loadSeasonTotals(S);
  const cmp2a = compareConstantsFiles({ shipped: shipped2a, league: r2a.constants, cellOf: twoACellResolver(hook), rescoredBy });
  const verdict2a = decideFile({ comparison: cmp2a, kind: '2a' });
  const weeks = weeksMethodBySeason(leagueLoad);

  // G2 steps 2-3 — the dynasty run on the league 2a file, and on the shipped 2a file
  const dynLoadFor = (p2a) => ({
    ...load,
    loadInSeasonConstants: (qbPrior, basis, p) => (p2a === IN_MEMORY_2A && p === IN_MEMORY_2A ? r2a.constants : (load.loadInSeasonConstants ?? INSEASON_DYN_LOAD.loadInSeasonConstants)(qbPrior, basis, p)),
  });
  const dynRun = (label, p2a) => {
    log(`G2 ${label}: --inseason --dynasty --basis league --inseason-2a ${p2a} …`);
    let rows = null;
    const r = runInSeasonDyn({ load: dynLoadFor(p2a), qbPrior: 'starter', basis: 'league', inseason2a: p2a, onRows: (x) => { rows = x; }, log: (m) => log(`[${label}] ${m}`) });
    const structure = dynStructure({ shipped: shippedDyn, league: r.constants });
    const comparison = compareConstantsFiles({ shipped: shippedDyn, league: r.constants, cellOf: dynCellResolver(rows), rescoredBy });
    const verdict = decideFile({ comparison, kind: 'dyn', structural: structure });
    let written = null;
    if (write) written = (writers.dyn ?? writeInSeasonDynArtifacts)({ result: r, verdictMd: buildInSeasonDynVerdictMarkdown(r) });
    return { pairing: r.meta.pairing, inSeasonConstants: r.meta.inSeasonConstants, structure, comparison, verdict, written, decisions: r.constants.decisions, prospectPriorKind: r.constants.prospectPriorKind?.kind ?? null };
  };
  const dynLeague2a = dynRun('2b dyn on league 2a', path2a);
  const dynShipped2a = dynRun('2c dyn on shipped 2a', SHIPPED_FILES.twoA.path);
  const decidingDyn = verdict2a.verdict === 'wire' ? dynLeague2a : dynShipped2a;

  // G3 — R3-FIT transport (report-only)
  log('G3: --fit under half_ppr …');
  const fitHalf = fitSummary(fit({ basis: 'half_ppr' }).fitReport);
  log('G3: --fit under league …');
  const fitLeague = fitSummary(fit({ basis: 'league' }).fitReport);
  const g3 = { halfPpr: fitHalf, league: fitLeague, table: g3Table(fitHalf, fitLeague) };

  const qbChain = { league: qbChainShares(r2a.coverage), halfPprCommitted: qbChainShares(readJson('backtests/2026-10-07-inseason-panel.json').coverage) };

  const result = {
    meta: { generatedAt, date, runtimeMs: Date.now() - t0, headRev: gitHead(), shippedFiles: commits, leagueScoringFixture: LEAGUE_SCORING_FIXTURE, positionFile: g1.positionFile },
    decisionRule: DECISION_RULE_MD,
    g1,
    g2: {
      twoA: { leagueFile: path2a, comparison: cmp2a, verdict: verdict2a, written: w2a, reconciliation: r2a.reconciliation, runtimeMs: r2a.meta.runtimeMs },
      dynLeague2a, dynShipped2a,
      dynDeciding: decidingDyn.pairing,
      verdicts: { twoA: verdict2a.verdict, dyn: decidingDyn.verdict.verdict },
      weeksBySeason: weeks, qbChain,
    },
    g3,
  };
  const verdictMd = buildLeagueBasisVerdictMarkdown(result);
  if (write) {
    (writers.panel ?? ((rel, obj) => writeText(rel, JSON.stringify(obj, replacer, 2) + '\n')))(panelPath, { ...result, g1: g1Slim(g1) });
    writeText(verdictPath, verdictMd);
    result.written = { panelPath, verdictPath };
  }
  return { ...result, verdictMd };
}

function replacer(k, v) { return v instanceof Set ? [...v] : v; }

/** G1 without the per-field failure samples' sets (JSON-safe). */
function g1Slim(g1) { return JSON.parse(JSON.stringify(g1, replacer)); }

// ─── Verdict markdown ──────────────────────────────────────────────────────────────────────────────────────────────

const f = (v, d = 3) => (v == null || !Number.isFinite(v) ? '—' : v.toFixed(d));
const kStr = (e) => (e == null ? '—' : `${e.k == null ? 'null' : e.k} (${e.basis})`);
const tbl = (headers, rows) => [`| ${headers.join(' | ')} |`, `|${headers.map(() => '---').join('|')}|`, ...rows.map(r => `| ${r.join(' | ')} |`)];
const ciS = (c) => (c ? `[${f(c[0], 3)}, ${f(c[1], 3)}]` : '—');

function entryTable(cmp) {
  const rows = cmp.entries.filter(e => !e.excluded).map(e => [
    `${e.name}.${e.cell}`, kStr(e.shipped), kStr(e.league), e.league ? `${e.league.rows ?? '—'} / ${e.league.players ?? '—'}` : '—',
    e.delta ? `${f(e.delta.mean, 4)} ${ciS(e.delta.ci95)}` : '—', e.label ?? '—', e.study ? 'study' : '',
    e.weeksMethod ? `${e.weeksMethod.exact}/${e.weeksMethod.scaled}/${e.weeksMethod.none}` : '—',
  ]);
  return tbl(['entry', 'shipped k (basis)', 'league k (basis)', 'rows / players', 'Δ|err| league fold − shipped [95% CI]', 'label', '', 'weeks exact/scaled/none (player-seasons)'], rows);
}

const pooledS = (p) => (p ? `${[p.cells != null && `${p.cells} cells`, p.rows != null && `${p.rows} rows`, p.players != null && `${p.players} players`].filter(Boolean).join(', ')}${p.cells != null || p.rows != null || p.players != null ? ', ' : ''}mean ${f(p.mean, 4)} ${ciS(p.ci95)} → **${p.label}**` : 'n/a');

/**
 * Verdicts-section lines for one file's pooled points delta. The DECISION reading is the pre-registered one (Anton, 2026-10-16): every
 * points entry's rows, deduplicated per cell, `same` entries included. The differing-only pool is disclosure, never the decision.
 */
function pooledVerdictLines(label, cmp) {
  const decided = cmp.entries.filter(e => !e.excluded && e.cellKey != null);
  const allSame = decided.length > 0 && decided.every(e => e.label === 'same');
  const out = [`- **Pooled points delta, ${label} — the decision reading** (all points entries' rows, deduplicated per cell, \`same\` included): ${pooledS(cmp.pooled)}.`];
  if (allSame) out.push(`  - Every decided entry's emitted k is identical, so this pooled delta measures fold-k leakage only (the shipped k was fitted on all seasons), not a basis effect.`);
  if (cmp.pooledDiffering) {
    out.push(`  - *Disclosure only — not the decision:* pooling only the cells where an emitted k differs: ${pooledS(cmp.pooledDiffering)}.`);
    const te = cmp.entries.find(e => e.name === 'K_ROS_POINTS_SHORT' && e.cell === 'TE' && e.delta);
    if (te) out.push(`  - Caveat: this reading is driven almost entirely by \`K_ROS_POINTS_SHORT.TE\` (shipped ${kStr(te.shipped)} vs league ${kStr(te.league)}, Δ ${f(te.delta.mean, 3)} ${ciS(te.delta.ci95)}, measured on \`${te.cellKey}\` rows) — a study-pin question, not a basis effect; backlog D-73 re-examines it independent of basis.`);
  }
  return out;
}

export function buildLeagueBasisVerdictMarkdown(r) {
  const L = [];
  const g1 = r.g1, g2 = r.g2, g3 = r.g3;
  L.push('# D-46 — league-basis mirror: graded before/after (verdict)', '',
    `Generated ${r.meta.generatedAt} (data \`${r.meta.headRev}\`+local). Scoring settings: \`${r.meta.leagueScoringFixture}\`; positions: \`${r.meta.positionFile}\`. ` +
      '`node bin/backtest.mjs --league-basis --write`.', '', r.decisionRule);

  L.push('## Verdicts', '',
    `- **\`${SHIPPED_FILES.twoA.path}\` (2a): \`${g2.verdicts.twoA}\`** — ${g2.twoA.verdict.reason}.`,
    `- **\`${SHIPPED_FILES.dyn.path}\` (dynasty): \`${g2.verdicts.dyn}\`** — decided on the ${g2.dynDeciding} run: ${(g2.dynDeciding === 'league-2a' ? g2.dynLeague2a : g2.dynShipped2a).verdict.reason}.`,
    ...pooledVerdictLines('2a', g2.twoA.comparison),
    ...pooledVerdictLines('dynasty (deciding run)', (g2.dynDeciding === 'league-2a' ? g2.dynLeague2a : g2.dynShipped2a).comparison),
    `- **G3:** ${g3.table.anyLabelDiffers ? 'a verdict label differs between bases — the committed `r3fit-exponent-harness.md` verdict does not transport to league basis (Session 1 records a backlog item).' : 'every verdict label is the same under both bases.'}`,
    '- **Exposure (stated, as pre-registered):** with roughly 40 points entries at 95% intervals, one spurious `BEATS` or `WORSE` is expected by chance; the pooled-delta requirement is the guard.', '');

  L.push('## G1 — mirror fidelity (a gate)', '', `**${g1.pass ? 'PASS' : 'FAIL'}.** Scoring settings deep-equal on every capture read: ${Object.entries(g1.settingsEqual).map(([d, v]) => `${d} ${v}`).join(', ')}.`, '');
  L.push(`### G1a — \`reconstructPositionBasisScale\` at S = ${g1.scaleSeason} vs the captured \`rookieBasisScale\``, '',
    ...tbl(['position', 'mirror scale', 'qualifying rows'], POSITIONS.map(p => [p, f(g1.scaleByPosition[p], 3), String(g1.qualifyingRows[p])])), '');
  for (const [d, cap] of Object.entries(g1.a.captures)) {
    L.push(`**${d}** (unrecovered ${cap.unrecovered})`, '', ...tbl(['position', 'rookie rows', 'captured scale', 'match', 'export position diff', 'absent from export'],
      POSITIONS.map(p => { const e = cap.byPosition[p]; return [p, String(e.rows), e.captured.join(', '), String(e.match), String(e.exportPositionDiff), String(e.exportAbsent)]; })), '');
  }
  L.push(`D3: qualifying (gp >= 10, half-PPR source) pids absent from \`${g1.positionFile}\`: ${g1.absentQualifyingPids}; the rookie-row position diffs between the export and the position recovered from the capture are in the tables above (they touch no qualifying history, so no scale moved). ` +
    (g1.a.pass ? 'No parity miss was attributable to position, so the players-state overlay fallback was not used.' : 'A parity miss occurred (G1a FAIL); see the tables above for its position, values and counts.'), '');

  const fieldRows = (c) => Object.entries(c.fields ?? c.byField).map(([n, v]) => [n, `${v.checked}`, `${v.fail}`]);
  L.push(`### G1b — rookie rows on ${g1.b.capture} (${g1.b.league.rows} rows; ${g1.b.league.chainExcluded} \`chain\` rows excluded from level/total)`, '',
    '**Under `league` (captured scale):**', '', ...tbl(['field', 'checked', 'mismatches'], fieldRows(g1.b.league)), '',
    '**Under `half_ppr` (scale 1) — the "before":**', '', ...tbl(['field', 'checked', 'mismatches'], fieldRows(g1.b.half_ppr)), '',
    `Capture consistency of the ceiling input to the literal 3 dp: ${g1.b.league.capturedCeilingInputConsistent}/${g1.b.league.rows}. **Deviation from the plan, stated:** the plan's literal "equals … at 3 dp" cannot hold — the captured \`rookieMultiplierProduct\` is rounded to 2 dp on ${g1.b.league.productDp2 ?? '—'} rows and 3 dp on ${g1.b.league.productDp3 ?? '—'}, so a literal check misses on \`ceilingInput\` only (${g1.b.league.rows - g1.b.league.capturedCeilingInputConsistent} of ${g1.b.league.rows} rows; the cause is capture rounding, not position, so D3's overlay fallback does not apply). The check is the product's rounding bound (half a unit at 2 dp × baseline × calibration, plus the 3-dp capture of the input): ${g1.b.league.fields.ceilingInput.fail} rows outside it under \`league\`, ${g1.b.half_ppr.fields.ceilingInput.fail} of ${g1.b.half_ppr.fields.ceilingInput.checked} outside it under \`half_ppr\`.`, '');
  L.push('### G1c — the boundary (rows checked under legacy rookie-QB / rookie-total models)', '');
  for (const [d, cap] of Object.entries(g1.c.captures)) {
    L.push(`**${d}** (${cap.side}-switch, envelope model \`${cap.model.model}\`)`, '',
      ...tbl(['model', 'rows', 'mismatches (all fields)'], [['half_ppr', String(cap.half_ppr.rows), String(cap.half_ppr.mismatchTotal)], ['league', String(cap.league.rows), String(cap.league.mismatchTotal)]]), '');
  }
  L.push('### G1d — veteran `basePPG` (T-F10L)', '',
    `${g1.d.candidates} veteran candidates: exact at 1 dp under league rows **${g1.d.league.match}**, under half-PPR rows ${g1.d.half_ppr.match} (${g1.d.candidates - g1.d.half_ppr.match} fail). ` +
      `Match rates (reported, not asserted): consistencyScore ${g1.d.consistencyScore.league}/${g1.d.consistencyScore.checked} league vs ${g1.d.consistencyScore.half_ppr} half-PPR; outlierRatio ${g1.d.outlierRatio.league} vs ${g1.d.outlierRatio.half_ppr}; ${g1.d.note}`, '');

  L.push('## G2 — the k re-fit', '');
  const commitRows = Object.entries(r.meta.shippedFiles).map(([k, v]) => [`\`${v.path}\``, `\`${v.expected.slice(0, 7)}\``, v.last ? `\`${v.last.slice(0, 7)}\`` : '—', String(v.match)]);
  L.push('Shipped files (the commits the app names are asserted against the last commit touching each file):', '', ...tbl(['file', 'app names', 'last commit touching it', 'match'], commitRows), '');
  const onlyOne = g2.twoA.comparison.entries.filter(e => e.label === 'shipped-missing' || e.label === 'league-missing');
  L.push('### 2a — `--inseason --basis league`', '', `League file \`${g2.twoA.leagueFile}\`. Reconciliation ${g2.twoA.reconciliation.pass}/${g2.twoA.reconciliation.population}.`, '', ...entryTable(g2.twoA.comparison), '');
  L.push(`Pooled points-only paired delta: ${g2.twoA.comparison.pooled ? `${g2.twoA.comparison.pooled.cells} cells, ${g2.twoA.comparison.pooled.rows} rows, ${g2.twoA.comparison.pooled.players} players, mean ${f(g2.twoA.comparison.pooled.mean, 4)} ${ciS(g2.twoA.comparison.pooled.ci95)} → **${g2.twoA.comparison.pooled.label}**` : 'n/a'}. ` +
    `Excluded (basis-invariant): ${[...new Set(g2.twoA.comparison.entries.filter(e => e.excluded).map(e => e.name))].join(', ')}.`, '',
    ...(onlyOne.length ? [`Structural differences (an entry on one side only — not decided by the rule, and a wiring would have to carry them): ${onlyOne.map(e => `\`${e.name}.${e.cell}\` (${e.label === 'shipped-missing' ? 'league file only' : 'shipped file only'})`).join(', ')}.`, ''] : []),
    'Note on pooled cells: where a league entry pins from a pooled-positions cell (`fixtureKey` …`|ALL`), the delta is measured on that cell\'s rows (all positions), as the plan prescribes — so a position\'s shipped k (e.g. a `study` TE value) is judged on rows it was never fitted on.', '');
  for (const [title, run] of [['2b — `--inseason --dynasty --basis league --inseason-2a <league 2a file>`', g2.dynLeague2a], ['2c — the same on the shipped 2a file (`--inseason-2a backtests/2026-10-07-inseason-constants.json`)', g2.dynShipped2a]]) {
    L.push(`### ${title}`, '', `Paired 2a: \`${run.inSeasonConstants}\`. File verdict on this run: **${run.verdict.verdict}**${run.pairing === g2.dynDeciding ? ' (the deciding run)' : ' (informational)'} — ${run.verdict.reason}.`, '',
      ...entryTable(run.comparison), '',
      `Pooled points-only paired delta: ${run.comparison.pooled ? `${run.comparison.pooled.rows} rows, mean ${f(run.comparison.pooled.mean, 4)} ${ciS(run.comparison.pooled.ci95)} → **${run.comparison.pooled.label}**` : 'n/a'}.`, '',
      `\`prospectPriorKind.kind\` unchanged: **${run.structure.kindEqual}**; \`decisions\` changed: ${run.structure.decisionsChanged.length}; \`reuse\` changed: ${run.structure.reuseChanged.length}.`, '',
      `\`diffDynConstants\` (league − shipped; ${run.structure.diff.length} differences):`, '',
      ...(run.structure.diff.length ? tbl(['path', 'shipped', 'league'], run.structure.diff.map(c => [`\`${c.path}\``, JSON.stringify(c.before), JSON.stringify(c.after)])) : ['none']), '');
  }
  L.push('### Weeks and the QB start chain', '',
    'Per-season weeks scored exactly vs ratio-scaled (the app would scale those weeks too; > 0.5% scaled in a season is a data-quality signal):', '',
    ...tbl(['season', 'rows', 'exact weeks', 'scaled weeks', 'scaled share', 'flag'], Object.entries(g2.weeksBySeason).map(([S, c]) => [S, String(c.rows), String(c.exactWeeks), String(c.scaledWeeks), c.scaledShare == null ? '—' : `${(c.scaledShare * 100).toFixed(3)}%`, c.flag ? '**>0.5%**' : ''])), '',
    'QB start-chain share distribution (median chain share per season; `half_ppr` = the committed 2026-10-07 panel, `league` = this run):', '',
    ...tbl(['season', 'half_ppr: incumbent / chain / stale / median share', 'league: incumbent / chain / stale / median share'],
      g2.qbChain.league.map(s => { const h = g2.qbChain.halfPprCommitted.find(x => x.S === s.S); const t = (x) => (x ? `${x.incumbent} / ${x.chain} / ${x.stale} / ${f(x.medianChainShare, 4)}` : '—'); return [String(s.S), t(h), t(s)]; })), '');

  L.push('## G3 — R3-FIT transport (report-only; no exponent is activated; `--fit` still defaults to `half_ppr`)', '',
    ...tbl(['position', 'verdict half_ppr', 'verdict league', 'base half_ppr', 'base league', 'sensitivity half_ppr', 'sensitivity league', 'differs'],
      g3.table.rows.map(x => [x.position, x.half_ppr.verdict, x.league.verdict, x.half_ppr.baseVerdict ?? '—', x.league.baseVerdict ?? '—', x.half_ppr.sensitivityVerdict ?? '—', x.league.sensitivityVerdict ?? '—', x.labelDiffers ? '**yes**' : 'no'])), '',
    'Fitted exponents (`wFinal`), half_ppr → league:', '',
    ...tbl(['position', 'exponents'], g3.table.rows.map(x => [x.position, Object.entries(x.exponents).map(([k, v]) => `${k} ${f(v.half_ppr, 2)} → ${f(v.league, 2)}`).join('; ')])), '',
    `**Reproduce:** \`node bin/backtest.mjs --league-basis --write\` (about ${Math.round(r.meta.runtimeMs / 60000)} min).`, '');
  return L.join('\n');
}

// ─── CLI branch ────────────────────────────────────────────────────────────────────────────────────────────────────

export function leagueBasisMain({ write = false, asJson = false, log = console.log, logErr = console.error } = {}) {
  try {
    const result = runLeagueBasis({ write, log: (m) => logErr(`[backtest] ${m}`) });
    if (result.stopped) {
      logErr(`[backtest] STOPPED at ${result.stopped}: mirror fidelity failed — G2 was not run. ${JSON.stringify({ a: result.g1.a.pass, b: result.g1.b.pass, c: result.g1.c.pass, d: result.g1.d.pass })}`);
      log(JSON.stringify(result.g1, replacer, 2));
      return 1;
    }
    if (write) logErr(`[backtest] Wrote ${result.written.panelPath}, ${result.written.verdictPath}`);
    log(asJson ? JSON.stringify({ ...result, verdictMd: undefined, g1: g1Slim(result.g1) }, replacer, 2) : result.verdictMd);
    return 0;
  } catch (err) {
    if (err instanceof ReconciliationStop) { logErr(`[backtest] ${err.message}`); return 1; }
    throw err;
  }
}
