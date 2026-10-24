/**
 * lib/vetReplay.mjs — the veteran "substitution replay" R, its gates and drift reports (plan january-grading-run-a §5.3–5.4).
 *
 * Pure: no I/O; every live input (birthdates, QB priors, recent-starter evidence, rookie flags) is injected.
 *
 * CR-15 MIRROR (the app's veteran composition, sleeper-dashboard src/utils/seasonProjection.js @ f7ebfa8):
 *   :1013-1054 combinedNewFactorRaw = Π of ten factors; combinedNewFactor = clamp(raw, 0.67, 1.50);
 *              pipelinePPG = clamp(basePPG·ageDelta·shareTrend·regressionFactor·teamFactor·depthFactor·combined, 0, 40);
 *              blended = (1−w)·pipelinePPG + w·compPPG; projectedPPG = blended (·qbStartShare on a QB `chain` row).
 *   :964       teamFactor = 1 + (16 − rank)/200 (the formulas are checked by the boundary-equality guard, not recomputed).
 *   src/utils/projectionSignals.js:31-35 breakout gate (age ≤ 24) — used only as the age rule in `replayR`.
 * The depth branch is NOT forked here: lib/projectionFactors.mjs `reconstructDepthFactor` (already CR-15) is called.
 *
 * R is a replay of the *shipping* model on pre-kickoff inputs, built by substituting K-captured (pre-kickoff) values for
 * the factors that drift with live state into the newest-segment capture S(i) (delta form). It targets aggregate fidelity;
 * G-MECH proves the mechanics, Q reports the drift that the replay cannot remove. Report-only.
 */

import { reconstructDepthFactor, reconstructQbPreseasonShares } from './projectionFactors.mjs';
import { calculateFantasyPoints } from './fantasyPoints.mjs';
import { priorPPG } from './qbTakeover.mjs';

export const POSITIONS = ['QB', 'RB', 'WR', 'TE'];

/** The ten in-envelope factors (combinedNewFactorRaw is their product). */
export const ENVELOPE_KEYS = Object.freeze([
  'qbQualityFactor', 'momentumFactor', 'breakoutFactor', 'bounceBackFactor', 'tdRelianceFactor',
  'trajectoryFactor', 'efficiencyFactor', 'snapShareFactor', 'rzUsageFactor', 'teamRzShareFactor',
]);
/** The five factors the replay takes from S (or A, in G-MECH): boundary- and roster-independent (guard (a)). */
export const COHORT_KEYS = Object.freeze(['shareTrend', 'teamRzShareFactor', 'snapShareFactor', 'rzUsageFactor', 'efficiencyFactor']);

// ─── Tolerances (frozen, §13) ─────────────────────────────────────────────────

export const TOL = Object.freeze({
  g1: 0.15,          // |B(f_S) − projectedPPG|
  rowPpgStep: 0.1,   // |round1(p_R) − p_A|
  rowTotStep: 0.1,   // |T_R − T_A| ≤ 0.1·G_A + 0.1
  ratio: 0.003,      // |Σ ratio − 1| per position
  slack: 1e-9,
  g6: 0.98,          // age-table share-in-mode
  teamFactor: 0.0005,
  qbQuality: 0.0015,
});

const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
export const round1 = (x) => Math.round(x * 10) / 10;
const round4 = (x) => Math.round(x * 10000) / 10000;

// ─── Composition ──────────────────────────────────────────────────────────────

/**
 * B(f): the §1.3 blend on a factor set (unrounded). `raw` overrides the combinedNewFactorRaw (the delta form passes the
 * captured raw × substituted ratios); the default is the product of the ten captured (3 dp) factors.
 */
export function composeBlended(f, { raw = null } = {}) {
  let r = raw;
  if (r == null) { r = 1; for (const k of ENVELOPE_KEYS) r *= f[k]; }
  const combined = clamp(r, 0.67, 1.50);
  const pipeline = clamp(f.basePPG * f.ageDelta * f.shareTrend * f.regressionFactor * f.teamFactor * f.depthFactor * combined, 0, 40);
  const w = f.compBlendWeight ?? 0;
  const comp = f.compPPG ?? 0;
  return (1 - w) * pipeline + w * comp;
}

export const isChainFactors = (f) => f?.qbTakeoverBasis === 'chain';

/**
 * Delta-form recomposition of one source row S with substituted factors `sub` (any subset of S's factor keys).
 *   raw' = raw_S · Π(f'_j / f_S,j) over substituted in-envelope factors   (envelope clamp re-applied inside composeBlended)
 *   blended' = base + B(f') − B(f_S),  base = qbStarterPPG_S on a chain-in-S row, else projectedPPG_S
 *   p' = blended'  (·share on a chain-in-R QB);  G' = projectedGames_S
 *   T' = round1(p'·G'), or round1(blended'·share·games) on a chain-in-R row
 * @param {{ proj: object, f: object }} S
 * @param {object} sub
 * @param {{ share?: number|null, games?: number }} opts
 */
export function recompose(S, sub, { share = null, games = 17 } = {}) {
  const fS = S.f;
  const fP = { ...fS, ...sub };
  let raw = fS.combinedNewFactorRaw;
  for (const k of ENVELOPE_KEYS) {
    if (sub[k] !== undefined && fS[k] !== 0) raw *= fP[k] / fS[k];
  }
  const delta = composeBlended(fP, { raw }) - composeBlended(fS, { raw: fS.combinedNewFactorRaw });
  const base = isChainFactors(fS) ? fS.qbStarterPPG : S.proj.projectedPPG;
  const blended = base + delta;
  const G = S.proj.projectedGames;
  if (share != null) return { p: blended * share, T: round1(blended * share * games), G, blended, chain: true };
  return { p: blended, T: round1(blended * G), G, blended, chain: false };
}

// ─── Entries and tables ───────────────────────────────────────────────────────

/** Veteran rows of a capture: projection present, confidence ≠ 'rookie', factors present. */
export function vetEntries(snapshot, { veteransOnly = true } = {}) {
  const out = [];
  for (const [id, p] of Object.entries(snapshot.players ?? {})) {
    if (!p?.projection?.factors) continue;
    if (veteransOnly && p.projection.confidence === 'rookie') continue;
    out.push({ id: String(id), p, proj: p.projection, f: p.projection.factors });
  }
  return out;
}

/** Position by the `buildPositionMap` rule (scripts/grade-snapshot.mjs): QB/RB/WR/TE depth-chart membership. */
export function chartPositions(snapshot) {
  const map = new Map();
  for (const teamChart of Object.values(snapshot.teamDepthCharts ?? {})) {
    for (const pos of POSITIONS) {
      for (const e of teamChart[pos] ?? []) if (e.playerId != null) map.set(String(e.playerId), pos);
    }
  }
  return map;
}

const teamKey = (p) => String(p.nfl_team ?? '');

/**
 * teamFactor and qbQualityFactor tables from `entries` (veteran rows by default — rookie-path rows carry a neutral
 * teamFactor 1.0 and would pollute them). qbQuality is built from non-QB rows only.
 * @returns {{ team: Map<string, number>, qbq: Map<string, number>, violations: object[] }}
 */
export function teamTables(entries, positionOf) {
  const team = new Map(), qbq = new Map();
  const violations = [];
  const put = (tbl, name, key, v, id) => {
    if (!tbl.has(key)) { tbl.set(key, v); return; }
    if (tbl.get(key) !== v) violations.push({ table: name, team: key, first: tbl.get(key), other: v, id });
  };
  for (const e of entries) {
    const key = teamKey(e.p);
    put(team, 'teamFactor', key, e.f.teamFactor, e.id);
    if ((positionOf(e.id) ?? 'UNK') !== 'QB') put(qbq, 'qbQualityFactor', key, e.f.qbQualityFactor, e.id);
  }
  return { team, qbq, violations };
}

/** Whole years between `birthdate` (YYYY-MM-DD) and the UTC date of `isoDateTime`; null without a birthdate. */
export function ageAt(birthdate, isoDateTime) {
  if (!birthdate) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(birthdate);
  if (!m) return null;
  const d = new Date(isoDateTime);
  const [by, bm, bd] = [Number(m[1]), Number(m[2]), Number(m[3])];
  let age = d.getUTCFullYear() - by;
  const md = (d.getUTCMonth() + 1) * 100 + d.getUTCDate();
  if (md < bm * 100 + bd) age--;
  return age;
}

/**
 * Age table of one capture: (pos, ageAt(capture)) → the MODE of ageDelta over the capture's veteran rows; ties go to the
 * smallest value. `shareInMode` = Σ mode counts ÷ Σ all counts (G6).
 */
export function buildAgeTable(entries, positionOf, birthdateOf, capturedAt) {
  const cells = new Map();
  for (const e of entries) {
    const pos = positionOf(e.id);
    if (!POSITIONS.includes(pos)) continue;
    const age = ageAt(birthdateOf(e.id), capturedAt);
    if (age == null || e.f.ageDelta == null) continue;
    const key = `${pos}|${age}`;
    if (!cells.has(key)) cells.set(key, new Map());
    const c = cells.get(key);
    c.set(e.f.ageDelta, (c.get(e.f.ageDelta) ?? 0) + 1);
  }
  const table = {};
  let inMode = 0, total = 0;
  for (const [key, counts] of cells) {
    const [pos, age] = key.split('|');
    let best = null, bestN = -1;
    for (const [v, n] of counts) {
      if (n > bestN || (n === bestN && v < best)) { best = v; bestN = n; }
      total += n;
    }
    inMode += bestN;
    (table[pos] ??= {})[age] = best;
  }
  return { table, shareInMode: total > 0 ? inMode / total : null, n: total };
}

// ─── G1, G2, G3, G5, G6 ───────────────────────────────────────────────────────

/** G1 identity: B(f_S) reproduces projectedPPG within 0.15 on every non-chain veteran row. */
export function gIdentity(snapshot) {
  let n = 0, max = 0, bad = 0;
  const worst = [];
  for (const e of vetEntries(snapshot)) {
    if (isChainFactors(e.f)) continue;
    n++;
    const d = Math.abs(composeBlended(e.f) - e.proj.projectedPPG);
    if (d > max) max = d;
    if (d > TOL.g1) { bad++; if (worst.length < 5) worst.push({ id: e.id, diff: d }); }
  }
  return { rows: n, max, bad, worst, pass: bad === 0 };
}

/**
 * G2 depth: recompute depthStale and depthFactor on the capture's own orders; equal to the captured values on every veteran
 * row. `recentStarterOf(id)` and `qbRoleOf(id)` (the capture's own QB-room role) are injected.
 */
export function gDepth(snapshot, { positionOf, recentStarterOf, qbRoleOf = () => null }) {
  let n = 0;
  const mismatches = [];
  for (const e of vetEntries(snapshot)) {
    n++;
    const order = e.p.depthChartOrder ?? null;
    const recent = recentStarterOf(e.id) === true;
    const pos = positionOf(e.id) ?? 'UNK';
    const stale = order != null && order >= 2 && recent;
    const factor = reconstructDepthFactor(order, recent, { position: pos, model: 'qb-takeover', qbRole: pos === 'QB' ? qbRoleOf(e.id) : null });
    if (factor !== e.f.depthFactor || stale !== (e.f.depthStale === true)) {
      if (mismatches.length < 10) mismatches.push({ id: e.id, order, recent, factor, got: e.f.depthFactor, stale, gotStale: e.f.depthStale });
    }
  }
  return { rows: n, mismatches: mismatches.length, sample: mismatches, pass: mismatches.length === 0 };
}

/** G3 tables: teamFactor / qbQualityFactor constant within team across veteran rows. */
export function gTables(snapshot, positionOf, { entries = null } = {}) {
  const t = teamTables(entries ?? vetEntries(snapshot), positionOf);
  return { teams: t.team.size, violations: t.violations.length, sample: t.violations.slice(0, 5), pass: t.violations.length === 0, tables: t };
}

/** Boundary-equality guard (a)–(c) on one pair of captures (§5.2). */
export function boundaryGuard(Acap, Bcap) {
  const out = { a: { common: 0, diffs: 0, sample: [] }, b: { rows: 0, bad: 0, sample: [] }, c: { rows: 0, bad: 0, sample: [] }, pass: true };
  const eA = new Map(vetEntries(Acap).map(e => [e.id, e]));
  for (const e of vetEntries(Bcap)) {
    const a = eA.get(e.id);
    if (!a) continue;
    out.a.common++;
    const diff = COHORT_KEYS.filter(k => a.f[k] !== e.f[k]);
    if (diff.length) { out.a.diffs++; if (out.a.sample.length < 5) out.a.sample.push({ id: e.id, keys: diff }); }
  }
  for (const cap of [Acap, Bcap]) {
    for (const e of vetEntries(cap)) {
      out.b.rows++;
      const tf = e.f.teamFactor;
      const r = 16 - (tf - 1) * 200;
      const rr = Math.round(r);
      if (!(rr >= 1 && rr <= 32 && Math.abs(tf - (1 + (16 - rr) / 200)) <= TOL.teamFactor)) {
        out.b.bad++; if (out.b.sample.length < 5) out.b.sample.push({ id: e.id, teamFactor: tf });
      }
      out.c.rows++;
      const q = e.f.qbQualityFactor, s = e.f.qbQualityScore;
      const ok = s == null ? q === 1 : Math.abs(q - (1 + (s - 50) / 1000)) <= TOL.qbQuality;
      if (!ok) { out.c.bad++; if (out.c.sample.length < 5) out.c.sample.push({ id: e.id, qbQualityFactor: q, qbQualityScore: s }); }
    }
  }
  out.pass = out.a.diffs === 0 && out.b.bad === 0 && out.c.bad === 0;
  return out;
}

/** QB rooms of a capture for the start-share reconstruction (G5 variant: captured set, rk from the T-QB-3 rule). */
export function capturedQbRooms(snapshot) {
  const out = [];
  for (const [id, p] of Object.entries(snapshot.players ?? {})) {
    const f = p.projection?.factors;
    if (!f?.qbTakeoverBasis || f.qbTakeoverBasis === 'none') continue;
    const rookiePath = p.projection.confidence === 'rookie';
    out.push({ id: String(id), p, f, rookiePath, team: p.nfl_team ?? null, order: p.depthChartOrder ?? null,
      rookie: rookiePath && String(f.rookieGamesBasis ?? '').endsWith('|0') });
  }
  return out;
}

/** League-rescored 2025 PPG prior for a QB (the parity test's rule: dot product of stats under the capture's scoring). */
export function makePriorOf(totals, scoringSettings) {
  return (id) => {
    const rec = totals?.[id];
    if (!rec) return null;
    return priorPPG({ gamesPlayed: rec.gamesPlayed, fantasyPoints: calculateFantasyPoints(rec.stats ?? {}, scoringSettings) });
  };
}

/**
 * recentStarter(id): gamesStarted ≥ 8 in the player's last qualifying season ≤ `lastSeason` (gp ≥ 8, finite fantasyPoints),
 * from served season-totals. `totalsOf(year)` is injected (memoise it).
 */
export function makeRecentStarterOf(totalsOf, lastSeason = 2025, firstSeason = 2012) {
  const memo = new Map();
  return (id) => {
    if (memo.has(id)) return memo.get(id);
    let r = false;
    for (let y = lastSeason; y >= firstSeason; y--) {
      const row = totalsOf(y)?.[id];
      if (row && (row.gamesPlayed ?? 0) >= 8 && Number.isFinite(row.fantasyPoints)) { r = (row.gamesStarted ?? 0) >= 8; break; }
    }
    memo.set(id, r);
    return r;
  };
}

/** G5: the reconstruction reproduces qbTakeoverBasis and every chain qbStartShare (4 dp) on VETERAN QB rows. */
export function gQbChain(snapshot, { priorOf, models }) {
  const qbs = capturedQbRooms(snapshot);
  const shares = reconstructQbPreseasonShares({ qbs: qbs.map(q => ({ id: q.id, team: q.team, order: q.order, rookie: q.rookie })), priorOf, models });
  const res = { vetRows: 0, vetMismatch: 0, rookieRows: 0, rookieMismatch: 0, sample: [], roles: shares };
  for (const q of qbs) {
    const r = shares[q.id];
    const basis = q.f.qbTakeoverBasis;
    let ok;
    if (basis === 'incumbent') ok = r.role === 'incumbent';
    else if (basis === 'chain') ok = r.role === 'backup' && round4(r.share) === q.f.qbStartShare;
    else if (basis === 'stale') ok = r.role === 'backup' && q.f.depthStale === true;
    else ok = true; // other bases are not gated
    if (q.rookiePath) { res.rookieRows++; if (!ok) res.rookieMismatch++; }
    else {
      res.vetRows++;
      if (!ok) { res.vetMismatch++; if (res.sample.length < 5) res.sample.push({ id: q.id, basis, role: r.role, share: r.share, captured: q.f.qbStartShare }); }
    }
  }
  res.pass = res.vetMismatch === 0;
  return res;
}

/** G6: age-table share-in-mode ≥ 0.98 on a capture. */
export function gAgeTable(snapshot, { positionOf, birthdateOf }) {
  const t = buildAgeTable(vetEntries(snapshot), positionOf, birthdateOf, snapshot.capturedAt);
  return { shareInMode: t.shareInMode, n: t.n, pass: t.shareInMode != null && t.shareInMode >= TOL.g6 };
}

// ─── G-MECH ───────────────────────────────────────────────────────────────────

/** The substitution set that carries A's captured inputs (G-MECH "mech" arm; also Q's reference arm). */
function mechSub(a, tablesA, posA, includeAge = true) {
  const key = teamKey(a.p);
  const sub = {
    teamFactor: tablesA.team.get(key) ?? 1.0,
    depthFactor: a.f.depthFactor,
    breakoutFactor: a.f.breakoutFactor,
  };
  if (posA !== 'QB') sub.qbQualityFactor = tablesA.qbq.get(key) ?? 1.0;
  for (const k of COHORT_KEYS) sub[k] = a.f[k];
  if (includeAge) { sub.ageDelta = a.f.ageDelta; sub.compPPG = a.f.compPPG; sub.compBlendWeight = a.f.compBlendWeight; }
  return sub;
}

/**
 * Pair rows: veterans present in both A and B; chain in A or B excluded (counted). Position by A's charts.
 */
function pairRows(A, B, positionOf) {
  const eA = new Map(vetEntries(A).map(e => [e.id, e]));
  const rows = [];
  let chain = 0;
  for (const b of vetEntries(B)) {
    const a = eA.get(b.id);
    if (!a) continue;
    if (isChainFactors(a.f) || isChainFactors(b.f)) { chain++; continue; }
    rows.push({ id: b.id, a, b, pos: positionOf(b.id) ?? 'UNK' });
  }
  return { rows, chain };
}

/**
 * G-MECH for one pair (A, B) of the same segment (§5.4). All of A's inputs are replayed onto B's rows, so any difference is a
 * mechanics error. Ratios use unrounded p_R and T_R = round1(p_R·G_B) against captured p_A / T_A.
 * @param {{ tablesA?: object }} opts  tablesA overrides A's team tables (the rookie-pollution test)
 */
export function gMechPair(A, B, { positionOf = null, tablesA = null } = {}) {
  const pos = positionOf ?? (() => { const m = chartPositions(A); return (id) => m.get(id) ?? null; })();
  const tables = tablesA ?? teamTables(vetEntries(A), pos);
  const { rows, chain } = pairRows(A, B, pos);
  const sums = Object.fromEntries(POSITIONS.map(p => [p, { pR: 0, pA: 0, TR: 0, TA: 0 }]));
  let beyond = 0, maxSteps = 0, gMismatch = 0, unk = 0;
  const beyondSample = [];
  for (const r of rows) {
    const rec = recompose({ proj: r.b.proj, f: r.b.f }, mechSub(r.a, tables, r.pos), {});
    const GA = r.a.proj.projectedGames, GB = r.b.proj.projectedGames;
    if (GA !== GB) gMismatch++;
    const pA = r.a.proj.projectedPPG, TA = r.a.proj.projectedTotalPts;
    const TR = round1(rec.p * GB);
    const dp = Math.abs(round1(rec.p) - pA);
    const dt = Math.abs(TR - TA);
    maxSteps = Math.max(maxSteps, Math.round(dp * 10 - 1e-9));
    const ok = dp <= TOL.rowPpgStep + TOL.slack && dt <= TOL.rowTotStep * GA + TOL.rowTotStep + TOL.slack;
    if (!ok) { beyond++; if (beyondSample.length < 5) beyondSample.push({ id: r.id, pR: rec.p, pA, TR, TA }); }
    if (!POSITIONS.includes(r.pos)) { unk++; continue; }
    const s = sums[r.pos];
    s.pR += rec.p; s.pA += pA; s.TR += TR; s.TA += TA;
  }
  const byPos = {};
  let worstPpg = 0, worstTot = 0, ratioOk = true;
  for (const p of POSITIONS) {
    const s = sums[p];
    if (s.pA <= 0 || s.TA <= 0) { byPos[p] = null; continue; }
    const ppg = Math.abs(s.pR / s.pA - 1), tot = Math.abs(s.TR / s.TA - 1);
    byPos[p] = { ppg, tot };
    worstPpg = Math.max(worstPpg, ppg); worstTot = Math.max(worstTot, tot);
    if (ppg > TOL.ratio || tot > TOL.ratio) ratioOk = false;
  }
  return {
    rows: rows.length, excludedChain: chain, unk, beyond, maxSteps, gMismatch,
    byPos, worstPpg, worstTot, beyondSample,
    pass: beyond === 0 && gMismatch === 0 && ratioOk,
  };
}

// ─── M10 window selection ─────────────────────────────────────────────────────

const DAY = 86400000;
const YEAR_END = Date.parse('2027-01-01T00:00:00Z');

/**
 * Pair (4) / M10 and Q-within spans on the last segment. `segCaptures` = [{ date, capturedAt }] ascending.
 * M10: A = first; B = last with capturedAt ≤ A + 9 days and < 2027-01-01. Q-within: B = last with capturedAt < 2027-01-01.
 * Returns { a, b } with b null when no B ≠ A exists (→ `skipped`).
 */
export function selectSpan(segCaptures, kind) {
  if (!segCaptures.length) return { a: null, b: null };
  const a = segCaptures[0];
  const aT = Date.parse(a.capturedAt);
  let b = null;
  for (const c of segCaptures) {
    const t = Date.parse(c.capturedAt);
    if (c === a || t >= YEAR_END) continue;
    if (kind === 'm10' && t > aT + 9 * DAY) continue;
    b = c;
  }
  return { a, b };
}

// ─── Q — drift ────────────────────────────────────────────────────────────────

/**
 * Q (§5.4): A's inputs replayed onto B's rows under (live) the §5.3 rule — B's comps, B's age table at A's age, the breakout
 * age rule — and (mech) A's comps / ageDelta / breakout. Per position Q_ppg = Σp_live/Σp_mech − 1, Q_tot likewise (T = round1(p·G_B));
 * plus the live row count with |round1(p_live) − p_A| > 0.1 (`off`, per the plan's wording) and, beside it, against B's captured
 * projectedPPG (`offB` — the basis the plan's quoted 54/419 and 119/409 analogues match). Rule (a) of G-MECH is never applied (G legitimately differs).
 */
export function qDrift(A, B, { positionOf = null, birthdateOf }) {
  const m = chartPositions(A);
  const pos = positionOf ?? ((id) => m.get(id) ?? null);
  const tablesA = teamTables(vetEntries(A), pos);
  const ageB = buildAgeTable(vetEntries(B), pos, birthdateOf, B.capturedAt);
  const { rows, chain } = pairRows(A, B, pos);
  const sums = Object.fromEntries(POSITIONS.map(p => [p, { live: 0, mech: 0, Tlive: 0, Tmech: 0, n: 0, off: 0, offB: 0 }]));
  let off = 0, offB = 0, n = 0;
  for (const r of rows) {
    const S = { proj: r.b.proj, f: r.b.f };
    const mech = recompose(S, mechSub(r.a, tablesA, r.pos), {});
    // live: A's inputs except the three drifting ones, which follow §5.3 (S = B)
    const sub = mechSub(r.a, tablesA, r.pos, false);
    const bd = birthdateOf(r.id);
    const ageA = ageAt(bd, A.capturedAt), ageBb = ageAt(bd, B.capturedAt);
    const cell = POSITIONS.includes(r.pos) && ageA != null ? ageB.table[r.pos]?.[ageA] : undefined;
    if (cell !== undefined) sub.ageDelta = cell;
    if (bd == null || ageA === ageBb || ageA > 24) delete sub.breakoutFactor; // S's value stands
    const live = recompose(S, sub, {});
    n++;
    const missed = Math.abs(round1(live.p) - r.a.proj.projectedPPG) > TOL.rowPpgStep + TOL.slack;
    if (missed) off++;
    // the plan's quoted "today" analogues (54/419, 119/409) count against B's captured value, not A's — reported beside it
    const missedB = Math.abs(round1(live.p) - r.b.proj.projectedPPG) > TOL.rowPpgStep + TOL.slack;
    if (missedB) offB++;
    if (!POSITIONS.includes(r.pos)) continue;
    const s = sums[r.pos];
    const GB = r.b.proj.projectedGames;
    s.live += live.p; s.mech += mech.p;
    s.Tlive += round1(live.p * GB); s.Tmech += round1(mech.p * GB);
    s.n++; if (missed) s.off++; if (missedB) s.offB++;
  }
  const byPos = {};
  for (const p of POSITIONS) {
    const s = sums[p];
    byPos[p] = s.mech > 0 ? { Q_ppg: s.live / s.mech - 1, Q_tot: s.Tlive / s.Tmech - 1, rows: s.n, off: s.off, offB: s.offB } : null;
  }
  return { rows: n, excludedChain: chain, off, offB, byPos };
}

// ─── Replay R ─────────────────────────────────────────────────────────────────

/**
 * R rows for P = K's veteran rows (§5.3). Each P member is replayed from S(i) (the earliest eligible last-segment capture
 * holding it as a veteran) or marked `imputed` (no S(i)) or `dropped` (G5 failed and the K role is backup/chain).
 *
 * S captures are consumed lazily in ascending order (a January run holds ~80 of them): each is loaded, its pending P members
 * are replayed, `onCapture` runs while the snapshot is in hand (gates G1/G2/G5/G6 on contributing captures), then it is dropped.
 *
 * @param {object} args
 * @param {object} args.K                      K snapshot
 * @param {{ date: string, snapshot?: object, load?: () => object }[]} args.sCaptures  eligible last-segment captures, ascending
 * @param {(id) => string|null} args.positionOfK
 * @param {(id) => string|null} args.birthdateOf
 * @param {(id) => boolean|null} args.drafted2026Of  true/false from the crosswalk; null = no crosswalk entry
 * @param {(id) => boolean} args.recentStarterOf
 * @param {object} args.qbModels               pinnedQbChainModels(...)
 * @param {(id) => number|null} args.priorOf
 * @param {boolean} [args.useAgeTable=true]    false after a G6 failure (S's ageDelta kept everywhere)
 * @param {boolean} [args.dropQbBackups=false] true after a G5 failure
 * @param {boolean} [args.kSourced=true]       false = sensitivity "S's values for every K-sourced factor"
 * @param {'K'|'S'} [args.teamTableSource='K'] 'S' = sensitivity "S's teamFactor table"
 * @param {(info: { date: string, snapshot: object, assigned: number }) => void} [args.onCapture]
 */
export function replayR({
  K, sCaptures, positionOfK, birthdateOf, drafted2026Of, recentStarterOf, qbModels, priorOf,
  useAgeTable = true, dropQbBackups = false, kSourced = true, teamTableSource = 'K', onCapture = null,
}) {
  const kEntries = vetEntries(K);
  const kTables = teamTables(kEntries, positionOfK);

  // K's QB rooms: every QB-position row of K that has a team, vet or rookie
  const qbs = [];
  for (const [id, p] of Object.entries(K.players ?? {})) {
    if (positionOfK(id) !== 'QB') continue;
    const d = drafted2026Of(id);
    const rookie = d === true || (d == null && p.projection?.confidence === 'rookie');
    qbs.push({ id: String(id), team: p.nfl_team ?? null, order: p.depthChartOrder ?? null, rookie });
  }
  const rooms = reconstructQbPreseasonShares({ qbs, priorOf, models: qbModels });

  const counts = {
    p: kEntries.length, replayed: 0, imputed: 0, dropped: 0,
    ageNoBirthdate: 0, ageNoCell: 0, breakoutFromK: 0, breakoutNoBirthdate: 0,
    qbChain: 0, kTeamMissing: 0, captures: 0,
  };
  const out = new Map();   // id → row
  const pending = new Set();
  for (const k of kEntries) {
    const pos = positionOfK(k.id) ?? 'UNK';
    const chainK = isChainFactors(k.f);
    const room = pos === 'QB' ? rooms[k.id] : null;
    if (dropQbBackups && pos === 'QB' && (room?.role === 'backup' || chainK)) {
      counts.dropped++;
      out.set(k.id, { id: k.id, pos, kind: 'dropped', chain: chainK, pK: k.proj.projectedPPG, TK: k.proj.projectedTotalPts, GK: k.proj.projectedGames, chainK });
    } else pending.add(k.id);
  }
  const kById = new Map(kEntries.map(e => [e.id, e]));

  for (const cap of sCaptures) {
    if (pending.size === 0) break;
    const snapshot = cap.snapshot ?? cap.load();
    const entries = vetEntries(snapshot);
    const byId = new Map(entries.map(e => [e.id, e]));
    const posMap = chartPositions(snapshot);
    const posS = (id) => posMap.get(id) ?? positionOfK(id) ?? null;
    let ageTable = null, sTables = null;
    let assigned = 0;
    for (const id of [...pending]) {
      const S = byId.get(id);
      if (!S) continue;
      pending.delete(id);
      assigned++;
      const k = kById.get(id);
      const pos = positionOfK(id) ?? 'UNK';
      const room = pos === 'QB' ? rooms[id] : null;
      const sub = {};
      let share = null, gamesOverride = null;
      const key = teamKey(k.p);
      if (kSourced) {
        let tt = kTables;
        if (teamTableSource === 'S') tt = (sTables ??= teamTables(entries, posS));
        if (!tt.team.has(key)) counts.kTeamMissing++;
        sub.teamFactor = tt.team.get(key) ?? 1.0;
        if (pos !== 'QB') sub.qbQualityFactor = kTables.qbq.get(key) ?? 1.0;
        const order = k.p.depthChartOrder ?? null;
        const recent = recentStarterOf(id) === true;
        sub.depthFactor = reconstructDepthFactor(order, recent, { position: pos, model: 'qb-takeover', qbRole: room?.role ?? null });
        const stale = order != null && order >= 2 && recent;
        if (pos === 'QB' && room?.role === 'backup' && !stale) { share = room.share; counts.qbChain++; }
      } else if (isChainFactors(S.f) && S.f.qbStartShare != null) {
        // every K-sourced input comes from S as captured: an S-chain QB stays chain with S's share (chain branch of recompose)
        share = S.f.qbStartShare;
        gamesOverride = S.proj.projectedGames ?? 17;
      }
      // ageDelta / breakout (§5.3)
      const bd = birthdateOf(id);
      const ageK = ageAt(bd, K.capturedAt), ageS = ageAt(bd, snapshot.capturedAt);
      if (bd == null) { counts.ageNoBirthdate++; counts.breakoutNoBirthdate++; }
      else {
        if (useAgeTable && POSITIONS.includes(pos)) {
          ageTable ??= buildAgeTable(entries, posS, birthdateOf, snapshot.capturedAt);
          const v = ageTable.table[pos]?.[ageK];
          if (v !== undefined) sub.ageDelta = v; else counts.ageNoCell++;
        }
        // K-breakout branch is K-sourced: off when kSourced is false (S's captured breakoutFactor stands)
        if (kSourced && !(ageK === ageS || ageK > 24)) { sub.breakoutFactor = k.f.breakoutFactor; counts.breakoutFromK++; }
      }
      const rec = recompose(S, sub, { share, games: gamesOverride ?? room?.games ?? 17 });
      counts.replayed++;
      out.set(id, {
        id, pos, kind: 'replayed', sDate: cap.date, p: rec.p, T: rec.T, G: rec.G, chain: rec.chain,
        pK: k.proj.projectedPPG, TK: k.proj.projectedTotalPts, GK: k.proj.projectedGames, chainK: isChainFactors(k.f),
        sRow: { p: S.proj.projectedPPG, T: S.proj.projectedTotalPts, G: S.proj.projectedGames, chain: isChainFactors(S.f) },
      });
    }
    counts.captures++;
    // gates run only on contributing captures (at least one assigned S(i))
    if (onCapture && assigned > 0) onCapture({ date: cap.date, snapshot, assigned });
  }
  // every remaining P member has no S(i)
  for (const id of pending) {
    const k = kById.get(id);
    counts.imputed++;
    out.set(id, {
      id, pos: positionOfK(id) ?? 'UNK', kind: 'imputed', chain: isChainFactors(k.f),
      pK: k.proj.projectedPPG, TK: k.proj.projectedTotalPts, GK: k.proj.projectedGames, chainK: isChainFactors(k.f),
    });
  }
  const rows = kEntries.map(k => out.get(k.id));
  return { rows, counts, rooms, kTables };
}
