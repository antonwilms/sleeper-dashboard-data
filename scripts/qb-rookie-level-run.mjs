/**
 * scripts/qb-rookie-level-run.mjs — rookie QB starter level adapter (`bin/backtest.mjs --qb-rookie-level`).
 * Task file: .claude/tasks/qb-rookie-level-research.md (P12a). Offline analysis only: no served file, no
 * manifest entry. The pure logic is lib/qbRookieLevel.mjs.
 *
 * Public exports:
 *   QB_ROOKIE_LOAD, SnapshotStop, ARTIFACT_CAPS
 *   runQbRookieLevel({ load, defaults, log })            → result (meta, coverage, excluded, q1…q4, constants)
 *   buildQbRookieLevelVerdictMarkdown(result)            → string
 *   formatQbRookieLevelConstantsJson(file)               → string
 *   writeQbRookieLevelArtifacts({ result, verdictMd })   → { panelPath, constantsPath, verdictPath, … }
 *   qbRookieLevelMain({ load, write, asJson, … })        → exit code
 */

import fs from 'fs';
import path from 'path';
import { repoPath } from '../lib/io.mjs';
import { INSEASON_LOAD, guardLoad, rookiePriorFor } from './inseason-run.mjs';
import { CoverageStop } from './qb-takeover-run.mjs';
import { primaryPassers, coverageFor } from '../lib/qbTakeover.mjs';
import {
  QB_ROOKIE_DEFAULTS, GROUPS, round2, round3, rookieGroup, rookieStarterGames, newExcluded, aggregate, levelTable,
  levelCI, playerDistribution, suppress, suppressPair, leagueRatio, liveLevel, unitsFrom, losoCompare,
} from '../lib/qbRookieLevel.mjs';

export const QB_ROOKIE_LOAD = INSEASON_LOAD;

export class SnapshotStop extends Error {
  constructor(message, detail) { super(message); this.name = 'SnapshotStop'; this.detail = detail; }
}

function need(v, what) {
  if (v == null) throw new Error(`[qb-rookie-level] ${what} not found in the store`);
  return v;
}

const POOLED = 'pooled';
const CELLS = [...GROUPS, POOLED];
const cellOf = (a) => ({ players: a?.players ?? 0, games: a?.games ?? 0, value: a && a.games > 0 ? round3(a.sumPts / a.games) : null });

function positionOfFrom(playerIds) {
  const positionOf = {};
  for (const entry of Object.values(playerIds?.ids ?? {})) {
    if (entry?.sleeperId && entry?.position) positionOf[entry.sleeperId] = entry.position;
  }
  return positionOf;
}

// ─── Q2 splits (report-only, complementary suppression) ───────────────────────

export function runQ2(games, defaults) {
  const dims = {
    era: { a: `${defaults.seasons.from}-${defaults.eraSplitFrom - 1}`, b: `${defaults.eraSplitFrom}-${defaults.seasons.to}`, side: (g) => (g.S < defaults.eraSplitFrom ? 'a' : 'b') },
    origin: { a: 'g1', b: 'takeover', side: (g) => (g.origin === 'g1' ? 'a' : 'b') },
    half: { a: `gIndex<=${defaults.halfSplitAfter}`, b: `gIndex>=${defaults.halfSplitAfter + 1}`, side: (g) => (g.gIndex <= defaults.halfSplitAfter ? 'a' : 'b') },
  };
  const out = {};
  for (const [dim, d] of Object.entries(dims)) {
    const agg = aggregate(games, (g) => `${g.group}|${d.side(g)}`);
    const aggP = aggregate(games, (g) => d.side(g));
    out[dim] = { sides: { a: d.a, b: d.b } };
    const suppressedRaw = [];   // raw (pre-suppression) sides of the groups whose pair was suppressed
    for (const cell of CELLS) {
      const [sa, sb] = cell === POOLED ? [aggP.get('a'), aggP.get('b')] : [agg.get(`${cell}|a`), agg.get(`${cell}|b`)];
      const rawA = cellOf(sa), rawB = cellOf(sb);
      const [a, b] = suppressPair(rawA, rawB, defaults.minCellPlayers);
      if (cell !== POOLED && (a !== rawA)) suppressedRaw.push([rawA, rawB]);
      out[dim][cell] = { a, b };
    }
    // Cross-group complement: pooled minus the published groups would recover the suppressed groups' combined side.
    if (suppressedRaw.length > 0) {
      const sumA = suppressedRaw.reduce((t, [x]) => t + x.players, 0);
      const sumB = suppressedRaw.reduce((t, [, y]) => t + y.players, 0);
      if ((sumA < defaults.minCellPlayers || sumB < defaults.minCellPlayers) && out[dim][POOLED].a.value !== null) {
        out[dim][POOLED] = { a: suppress(out[dim][POOLED].a, Infinity), b: suppress(out[dim][POOLED].b, Infinity) };
      }
    }
  }
  return out;
}

// ─── runQbRookieLevel ─────────────────────────────────────────────────────────

export function runQbRookieLevel({ load = QB_ROOKIE_LOAD, defaults = QB_ROOKIE_DEFAULTS, log = () => {} } = {}) {
  const g = guardLoad(load, { maxLoadSeason: defaults.seasons.to });
  const { from, to } = defaults.seasons;

  // 0. snapshot
  const snapshot = g.loadSnapshot(defaults.snapshotDate);
  if (snapshot == null) throw new SnapshotStop(`[qb-rookie-level] snapshots/${defaults.snapshotDate}.json not found — nothing written`);
  if (snapshot.scoringSettings == null || snapshot.players == null) {
    throw new SnapshotStop(`[qb-rookie-level] snapshot ${defaults.snapshotDate} lacks scoringSettings or players — nothing written`);
  }
  if (!(snapshot.targetSeason > to)) {
    throw new SnapshotStop(`[qb-rookie-level] snapshot targetSeason ${snapshot.targetSeason} is not above ${to} — nothing written`);
  }
  const bonus = snapshot.scoringSettings.bonus_fd_qb;
  if (typeof bonus === 'number' && bonus !== 0) {
    throw new SnapshotStop(`[qb-rookie-level] scoringSettings.bonus_fd_qb = ${bonus}: the app derives bonus_fd for 2012-2021 and this run does not port that — nothing written`);
  }
  const scoringSettings = snapshot.scoringSettings;

  const playerIds = need(g.loadPlayerIds(), 'nflverse/playerids.json');
  const bySleeper = playerIds.bySleeper ?? {};
  const positionOf = positionOfFrom(playerIds);

  // 1. coverage
  const ctx = new Map();
  const coverage = [];
  for (let S = from; S <= to; S++) {
    const gl = need(g.loadGameLogs(S), `nflverse/gamelogs/${S}.json`);
    const sc = need(g.loadSchedule(S), `nflverse/schedule/${S}.json`);
    const st = need(g.loadSeasonTotals(S), `nfl/season-totals/${S}.json`);
    const primaries = primaryPassers(gl, S);
    const cov = coverageFor(sc, primaries);
    coverage.push({ S, teamGames: cov.teamGames, withPrimary: cov.withPrimary, rate: Number.isFinite(cov.rate) ? cov.rate : null });
    ctx.set(S, { sc, st, primaries });
  }
  const bad = coverage.filter((c) => c.teamGames === 0 || c.rate == null || c.rate < defaults.coverageMin);
  if (bad.length) {
    throw new CoverageStop(
      `[qb-rookie-level] primary-passer coverage below ${defaults.coverageMin} (or an empty/non-finite denominator) in ${bad.map((c) => `${c.S}: ${c.withPrimary}/${c.teamGames}`).join(', ')} — nothing written`,
      coverage,
    );
  }

  // 2. games
  const games = [];
  const excluded = newExcluded();
  for (let S = from; S <= to; S++) {
    const c = ctx.get(S);
    const r = rookieStarterGames({ S, primaries: c.primaries, schedule: c.sc, seasonTotals: c.st, bySleeper, positionOf });
    games.push(...r.games);
    for (const k of Object.keys(excluded)) excluded[k] += r.excluded[k];
  }

  // 3. Q1 / Q2
  const table = levelTable(games);
  const empty = GROUPS.filter((grp) => table[grp].players === 0);
  if (empty.length) throw new Error(`[qb-rookie-level] group(s) with 0 rookies: ${empty.join(', ')} — stop and ask`);

  // snapshot scan for Q4 (and the captured basis scale used by Q1's league figures)
  const live = [];
  const snapExcluded = { notRookieRoute: 0, inconsistentCapture: 0, badBasisScale: 0 };
  for (const [pid, p] of Object.entries(snapshot.players)) {
    if (positionOf[pid] !== 'QB' || bySleeper[pid]?.draftYear !== snapshot.targetSeason) continue;
    if (p?.projection?.confidence !== 'rookie') { snapExcluded.notRookieRoute++; continue; }
    const lv = liveLevel(p);
    if (!lv) { snapExcluded.inconsistentCapture++; continue; }
    if (lv.levelHalf == null) { snapExcluded.badBasisScale++; continue; }
    live.push({ pid, p, lv });
  }
  const scaleCaptured = [...new Set(live.map((r) => r.lv.basisScale))].sort((a, b) => a - b);
  const scale = scaleCaptured.length === 1 ? scaleCaptured[0] : null;

  // league by season-ratio: per rookie-season ratio, left out when null
  const ratioOf = new Map();
  const leagueAgg = Object.fromEntries(CELLS.map((c) => [c, { sum: 0, games: 0, ids: new Set(), nullIds: new Set() }]));
  for (const gm of games) {
    const k = `${gm.pid}|${gm.S}`;
    if (!ratioOf.has(k)) ratioOf.set(k, leagueRatio(ctx.get(gm.S).st?.[gm.pid], scoringSettings));
    const ratio = ratioOf.get(k);
    for (const cell of [gm.group, POOLED]) {
      const a = leagueAgg[cell];
      if (ratio == null) { a.nullIds.add(k); continue; }
      a.sum += gm.pts * ratio; a.games++; a.ids.add(k);
    }
  }

  const q1 = {};
  const ciRaw = {};
  for (const cell of CELLS) {
    const grp = cell === POOLED ? null : cell;
    const ci = levelCI(games, grp, defaults.bootstrap);
    ciRaw[cell] = ci ? ci.ci95 : null;
    const row = table[cell];
    const la = leagueAgg[cell];
    q1[cell] = suppress({
      players: row.players, games: row.games, sumPts: row.sumPts, value: row.value,
      ci95: ci ? ci.ci95 : null, clusters: ci ? ci.clusters : 0, thin: row.players < defaults.thinPlayers,
      playerDistribution: playerDistribution(games, grp, defaults),
      leagueScaled: row.value != null && scale != null ? round3(row.value * scale) : null,
      leagueByRatio: { value: la.games > 0 ? round3(la.sum / la.games) : null, players: la.ids.size, games: la.games, seasonsWithoutRatio: la.nullIds.size },
    }, defaults.minCellPlayers);
  }
  const q2 = runQ2(games, defaults);
  log(`Q1/Q2 done: ${table.pooled.players} rookies, ${table.pooled.games} games`);

  // 4. Q3
  const units = unitsFrom(games, defaults.minUnitGames);
  const priors = new Map();
  for (const u of units) priors.set(`${u.pid}|${u.S}`, rookiePriorFor(u.pid, 'QB', u.S, playerIds));
  const nullPriors = [...priors.values()].filter((v) => v == null).length;
  if (nullPriors) throw new Error(`[qb-rookie-level] rookiePriorFor returned null for ${nullPriors} unit(s) — stop and ask`);
  const q3 = losoCompare({ games, units, priorOf: (u) => priors.get(`${u.pid}|${u.S}`), bootstrap: defaults.bootstrap });

  // 5. fixture + verification
  const fixture = { keys: ['group', 'players', 'games', 'sumPts'], rows: GROUPS.map((grp) => [grp, table[grp].players, table[grp].games, table[grp].sumPts]) };
  const starterPPG = {};
  for (const cell of CELLS) {
    const row = table[cell];
    starterPPG[cell] = {
      value: row.value, ci95: ciRaw[cell] ? ciRaw[cell].map(round3) : null,
      players: row.players, games: row.games, thin: row.players < defaults.thinPlayers,
    };
  }
  const verification = verifyFixture(fixture, starterPPG);

  // 6. Q4
  const q4Rows = live.map(({ pid, p, lv }) => {
    const grp = rookieGroup(bySleeper[pid]);
    const fit = grp ? starterPPG[grp] : null;
    const levelHalf = round3(lv.levelHalf);
    let cls = null;
    if (fit && fit.ci95) cls = levelHalf > fit.ci95[1] ? 'ABOVE' : levelHalf < fit.ci95[0] ? 'BELOW' : 'WITHIN';
    const f = p.projection.factors ?? {};
    return {
      pid, group: grp, draftOvr: bySleeper[pid]?.draftOvr ?? null, team: p.nfl_team ?? null, depthChartOrder: p.depthChartOrder ?? null,
      levelLeague: lv.level, source: lv.source, basisScale: lv.basisScale, levelHalf,
      reconHalf: rookiePriorFor(pid, 'QB', snapshot.targetSeason, playerIds),
      ktcMult: f.ktcMult ?? null, collegeContribution: f.collegeContribution ?? null,
      fitHalf: fit ? fit.value : null, fitCI: fit ? fit.ci95 : null,
      fitLeague: fit && fit.value != null ? round3(fit.value * lv.basisScale) : null,
      gapHalf: fit && fit.value != null ? round3(levelHalf - fit.value) : null, class: cls,
    };
  }).sort((a, b) => a.pid.localeCompare(b.pid, undefined, { numeric: true }));
  const byGroup = {};
  for (const grp of [...GROUPS, 'none']) {
    const rs = q4Rows.filter((r) => (r.group ?? 'none') === grp);
    if (!rs.length) continue;
    byGroup[grp] = {
      n: rs.length, meanLevelHalf: round3(rs.reduce((s, r) => s + r.levelHalf, 0) / rs.length),
      fitHalf: grp === 'none' ? null : starterPPG[grp].value,
      ABOVE: rs.filter((r) => r.class === 'ABOVE').length, WITHIN: rs.filter((r) => r.class === 'WITHIN').length, BELOW: rs.filter((r) => r.class === 'BELOW').length,
    };
  }
  const q4 = { snapshot: defaults.snapshotDate, targetSeason: snapshot.targetSeason, scaleCaptured, rows: q4Rows, byGroup, excluded: snapExcluded };

  const constants = {
    source: 'sleeper-dashboard-data backtests/<date>-qb-rookie-level-constants.json (node bin/backtest.mjs --qb-rookie-level --write)',
    generatedAt: new Date().toISOString(), basis: 'half_ppr',
    definitions: {
      seasons: { from, to },
      started: 'primary passer of the REG team-game: max(attempts+sacksSuffered); ties attempts, then pid (P6a primaryPassers)',
      rookie: 'bySleeper.draftYear === S', position: 'playerids ids position QB',
      groups: { top12: 'round 1, pick <= 12', r1: 'round 1, pick >= 13', day2: 'rounds 2-3', 'day3+': 'rounds 4-7 or undrafted' },
      pickConvention: 'within-round (bySleeper.draftPick)',
      outcome: 'season-totals weeklyPoints[week] (half_ppr) in each primary game; never gamelogs fantasyPoints',
      estimator: 'sum(points) / sum(primary games), game-weighted', thinPlayers: defaults.thinPlayers,
      leagueScaling: "multiply by the app's runtime positionBasisScale (as ROOKIE_CEILING)",
    },
    starterPPG,
    heldOut: {
      units: q3.units,
      mae: { shippedKtcNeutral: q3.mae.A, pooled: q3.mae.B, group: q3.mae.C, cap: q3.mae.D },
      groupVsShipped: pickCmp(q3, 'C', 'A'), groupVsPooled: pickCmp(q3, 'C', 'B'), capVsShipped: pickCmp(q3, 'D', 'A'),
    },
    live: {
      snapshot: defaults.snapshotDate, basisScale: scaleCaptured,
      byGroup: Object.fromEntries(Object.entries(byGroup).map(([k, v]) => [k, { n: v.n, meanLevelHalf: v.meanLevelHalf, ABOVE: v.ABOVE, WITHIN: v.WITHIN, BELOW: v.BELOW }])),
    },
    fixture,
    verification,
  };

  const result = {
    meta: { generatedAt: constants.generatedAt, seasons: { from, to }, snapshot: defaults.snapshotDate, basis: 'half_ppr', bootstrap: defaults.bootstrap, groupNote: 'round-based groups (D2); not P6a draftOvr bins' },
    coverage, excluded, q1, q2, q3, q4, constants,
    verdictInput: { groupsPinned: GROUPS.map((grp) => starterPPG[grp]), mendoza: q4Rows.find((r) => r.pid === '13269') ?? null },
  };
  return result;
}

function pickCmp(q3, nw, old) {
  const c = q3.comparisons.find((x) => x.new === nw && x.old === old);
  return { mean: c.mean, ci95: c.ci95, label: c.label };
}

/** Recompute every pinned value from the fixture rows; throw unless each equals the pinned value exactly. */
function verifyFixture(fixture, starterPPG) {
  const idx = Object.fromEntries(fixture.keys.map((k, i) => [k, i]));
  let pp = 0, pg = 0, ps = 0;
  for (const row of fixture.rows) {
    const grp = row[idx.group], players = row[idx.players], gamesN = row[idx.games], sumPts = row[idx.sumPts];
    const v = gamesN > 0 ? round3(sumPts / gamesN) : null;
    const pin = starterPPG[grp];
    if (v !== pin.value || players !== pin.players || gamesN !== pin.games) {
      throw new Error(`[qb-rookie-level] fixture re-derivation mismatch for ${grp}: ${v} vs pinned ${pin.value} — nothing written`);
    }
    pp += players; pg += gamesN; ps += sumPts;
  }
  const pooled = pg > 0 ? round3(round2(ps) / pg) : null;
  const pin = starterPPG[POOLED];
  if (pooled !== pin.value || pp !== pin.players || pg !== pin.games) {
    throw new Error(`[qb-rookie-level] fixture re-derivation mismatch for pooled: ${pooled} vs pinned ${pin.value} — nothing written`);
  }
  return { rederiveFromFixture: 'exact' };
}

// ─── verdict markdown ─────────────────────────────────────────────────────────

const f1 = (v) => (v == null || !Number.isFinite(v) ? '—' : v.toFixed(1));
const f3 = (v) => (v == null || !Number.isFinite(v) ? '—' : v.toFixed(3));
const ciS = (c) => (c ? `[${f3(c[0])}, ${f3(c[1])}]` : '—');

function md(headers, rows) {
  return [`| ${headers.join(' | ')} |`, `|${headers.map(() => '---').join('|')}|`, ...rows.map((r) => `| ${r.join(' | ')} |`)].join('\n');
}

export function buildQbRookieLevelVerdictMarkdown(result) {
  const { meta, coverage, excluded, q1, q2, q3, q4, constants: C } = result;
  const L = [];
  const out = (...s) => L.push(...s);
  const lab = (c) => `${f3(c.mean)} ${ciS(c.ci95)} **${c.label ?? '—'}**`;
  const classCounts = ['ABOVE', 'WITHIN', 'BELOW'].map((k) => `${k} ${q4.rows.filter((r) => r.class === k).length}`).join(', ');
  const mend = result.verdictInput.mendoza;

  out(`# Rookie QB starter level (P12a) — ${meta.generatedAt.slice(0, 10)}`, '',
    `Offline backtest, ${meta.seasons.from}–${meta.seasons.to}, half-PPR, game-weighted PPG in games a rookie QB started (primary passer of the team-game). Snapshot ${meta.snapshot}.`, '');

  out('## Summary', '');
  out(md(['group', 'PPG if he starts (half-PPR)', '95% CI', 'rookies', 'games', 'thin'],
    CELLS.map((c) => { const s = C.starterPPG[c]; return [c, f3(s.value), ciS(s.ci95), String(s.players), String(s.games), s.thin ? 'yes' : 'no']; })), '');
  out(`- Held out (leave-one-season-out, ${q3.units} rookie-seasons with ≥ 3 starts): group mean vs the shipped ktc-neutral level: ${lab(C.heldOut.groupVsShipped)}; group mean vs pooled rookie mean: ${lab(C.heldOut.groupVsPooled)}; cap (min of shipped and group) vs shipped: ${lab(C.heldOut.capVsShipped)}. Negative = the new comparator has the smaller error.`);
  out(`- Live ${q4.targetSeason} rookie QBs against their group's CI: ${classCounts} (n = ${q4.rows.length}).`);
  if (mend) {
    out(`- Mendoza (\`13269\`, ${mend.group ?? 'no group'}): live level ${f3(mend.levelLeague)} league = ${f3(mend.levelHalf)} half-PPR; ktc-neutral reconstruction ${f3(mend.reconHalf)}; top12 fit ${f3(mend.fitHalf)} ${ciS(mend.fitCI)}; **${mend.class ?? '—'}** (gap ${f3(mend.gapHalf)}).`);
  } else {
    out('- Mendoza (`13269`) is not among the live rookie-route QB rows in this snapshot.');
  }
  out('');

  out('## Coverage and exclusions', '',
    md(['season', 'team-games', 'with primary', 'rate'], coverage.map((c) => [String(c.S), String(c.teamGames), String(c.withPrimary), c.rate == null ? '—' : c.rate.toFixed(4)])), '',
    `Excluded primary games: ${Object.entries(excluded).map(([k, v]) => `${k} ${v}`).join(', ')}. Snapshot rows excluded: ${Object.entries(q4.excluded).map(([k, v]) => `${k} ${v}`).join(', ')}.`, '');

  out('## Q1 — Level', '',
    md(['group', 'rookies', 'games', 'value', '95% CI', 'rookies with ≥ 3 starts (n)', 'player-weighted mean', 'league × scale', 'league by ratio'],
      CELLS.map((c) => {
        const r = q1[c], d = r.playerDistribution;
        return [c, String(r.players), String(r.games), f3(r.value), ciS(r.ci95), String(d?.n ?? 0), f3(d?.mean), f3(r.leagueScaled), `${f3(r.leagueByRatio?.value)} (${r.leagueByRatio?.players ?? 0} rookies)`];
      })), '',
    `The player-weighted mean covers the rookie-seasons with ≥ 3 starts (the Q3 unit set); cells under 3 rookies show \`—\`. League × scale uses the snapshot's captured \`rookieBasisScale\` (${q4.scaleCaptured.join(', ') || '—'}).`, '');

  out('## Q2 — Splits (report-only)', '', 'Each split is a two-way partition; if either side has < 3 rookies, both are `—` (complementary suppression).', '');
  for (const dim of ['era', 'origin', 'half']) {
    const s = q2[dim];
    out(`### ${dim}: ${s.sides.a} vs ${s.sides.b}`, '',
      md(['group', `${s.sides.a} rookies`, 'games', 'value', `${s.sides.b} rookies`, 'games', 'value'],
        CELLS.map((c) => [c, String(s[c].a.players), String(s[c].a.games), f3(s[c].a.value), String(s[c].b.players), String(s[c].b.games), f3(s[c].b.value)])), '');
  }

  out('## Q3 — Held out vs the shipped level', '',
    md(['comparator', 'MAE'], [['A shipped ktc-neutral', f3(q3.mae.A)], ['B pooled rookie mean', f3(q3.mae.B)], ['C group mean', f3(q3.mae.C)], ['D min(A, C)', f3(q3.mae.D)]]), '',
    md(['comparison', 'mean Δ error', '95% CI', 'label'], q3.comparisons.map((c) => [`${c.new} vs ${c.old}`, f3(c.mean), ciS(c.ci95), c.label ?? '—'])), '',
    md(['group', 'units', 'mean signed error of A (A − actual)'], GROUPS.map((grp) => [grp, String(q3.biasA[grp].n), f3(q3.biasA[grp].mean)])), '',
    `Units: ${q3.units} (${GROUPS.map((grp) => `${grp} ${q3.unitsByGroup[grp]}`).join(', ')}); group-mean fallback to pooled: ${q3.cFallback}.`, '',
    '**Selection caveat.** A is the ktc-neutral reconstruction. The live app multiplies by `ktcMult` (0.70–1.30) and `collegeContribution`; for top picks both run above 1, so live levels sit above A (Q4 shows by how much). Q3 tests the reconstructable part of the shipped level, not the live number.', '');

  out(`## Q4 — Live ${q4.targetSeason} rookie QBs vs the fit`, '',
    md(['pid', 'group', 'team', 'dp', 'level (league)', 'level (half)', 'recon (half)', 'ktcMult', 'college', 'fit (half)', 'fit CI', 'gap', 'class'],
      q4.rows.map((r) => [r.pid, r.group ?? '—', r.team ?? '—', String(r.depthChartOrder ?? '—'), f3(r.levelLeague), f3(r.levelHalf), f3(r.reconHalf), f3(r.ktcMult), f3(r.collegeContribution), f3(r.fitHalf), ciS(r.fitCI), f3(r.gapHalf), r.class ?? '—'])), '',
    md(['group', 'n', 'mean level (half)', 'fit (half)', 'ABOVE', 'WITHIN', 'BELOW'],
      Object.entries(q4.byGroup).map(([k, v]) => [k, String(v.n), f3(v.meanLevelHalf), f3(v.fitHalf), String(v.ABOVE), String(v.WITHIN), String(v.BELOW)])), '',
    '`levelHalf` = level ÷ captured `rookieBasisScale`, rounded to 3 dp; the class compares that rounded value with the constants\' rounded CI.', '');

  out('## Definitions and notes', '',
    '- **Groups are round-based** (D2): top12 = round 1 pick ≤ 12, r1 = round 1 pick ≥ 13, day2 = rounds 2–3, day3+ = rounds 4–7 or undrafted. This deliberately differs from P6a\'s `draftOvr` bins (late round-3 compensatory picks have `draftOvr` > 100).',
    '- **Selection.** Day-2/day-3 starters are a selected subset (only the good ones start), so a group value is "PPG **if** he starts", never a talent estimate for every rookie in the group.',
    '- **Estimator.** Σ points ÷ Σ primary games per group (half-PPR `weeklyPoints`; no gamelogs points are read). CIs resample rookie-seasons (4000, seed 12345).', '');

  out('## For P12b', '',
    '1. `qbStarterPPG` is `ceiledPPG`, also the rookie route\'s `projectedPPG`, which the dynasty arm-B prior reads: changing the shared level moves the 2c prior (CR-25 re-fit). Scope to `qbStarterPPG` alone, or accept the re-fit.',
    '2. Groups map from the app\'s draft match: top12 = round 1 && pick ≤ 12, r1 = round 1 && pick ≥ 13, day2 = `DAY2_TIERS`, day3+ = `DAY3_TIERS` ∪ undrafted; unknown capital has no group (keep the current level).',
    '3. "Replace" raises day-2/day-3 starter levels (selected starters score above their shipped level); "cap" (Q3 D) only lowers. This verdict does not choose.',
    '4. Any change re-mirrors `lib/rookieMirror.mjs` (CR-15), bumps `PRIOR_MODEL_FROM`, adds an anchor-policy boundary, and extends CR-27.',
    '5. Pinned values are half-PPR; multiply by `positionBasisScale.QB` at runtime like `ROOKIE_CEILING`.', '');

  out('## What this does not model', '',
    'Rookie development within the season beyond the Q2 half split, offensive environment, injuries shortening starts.', '',
    `Fixture re-derivation: ${C.verification.rederiveFromFixture}.`, '',
    '**Reproduce:** node bin/backtest.mjs --qb-rookie-level --write');
  return L.join('\n');
}

// ─── artifact writing (serialise → cap check → write) ─────────────────────────

export const ARTIFACT_CAPS = { panelBytes: 5 * 1024 * 1024, constantsBytes: 300 * 1024 };

/** One line per top-level key; each fixture row on its own line, so diffs stay readable. */
export function formatQbRookieLevelConstantsJson(file) {
  const { fixture, verification, ...rest } = file;
  const out = ['{'];
  Object.entries(rest).forEach(([k, v]) => out.push(`  ${JSON.stringify(k)}: ${JSON.stringify(v)},`));
  out.push('  "fixture": {');
  out.push(`    "keys": ${JSON.stringify(fixture.keys)},`);
  out.push('    "rows": [', ...fixture.rows.map((r, i, a) => `      ${JSON.stringify(r)}${i < a.length - 1 ? ',' : ''}`), '    ]');
  out.push('  },');
  out.push(`  "verification": ${JSON.stringify(verification)}`, '}');
  return out.join('\n') + '\n';
}

export function writeQbRookieLevelArtifacts({ result, verdictMd, root = null, caps = ARTIFACT_CAPS }) {
  const date = result.meta.generatedAt.slice(0, 10);
  const panelPath = `backtests/${date}-qb-rookie-level-panel.json`;
  const constantsPath = `backtests/${date}-qb-rookie-level-constants.json`;
  const verdictPath = `grading/${date}-qb-rookie-level-verdict.md`;
  const { constants, ...panel } = result;
  const panelJson = JSON.stringify(panel, null, 2) + '\n';
  const constantsJson = formatQbRookieLevelConstantsJson(constants);
  if (Buffer.byteLength(panelJson) > caps.panelBytes) throw new Error(`[qb-rookie-level] panel artifact ${Buffer.byteLength(panelJson)} B exceeds the ${caps.panelBytes} B cap`);
  if (Buffer.byteLength(constantsJson) > caps.constantsBytes) throw new Error(`[qb-rookie-level] constants artifact ${Buffer.byteLength(constantsJson)} B exceeds the ${caps.constantsBytes} B cap`);
  const abs = (rel) => (root ? path.join(root, rel) : repoPath(rel));
  fs.mkdirSync(abs('backtests'), { recursive: true });
  fs.mkdirSync(abs('grading'), { recursive: true });
  fs.writeFileSync(abs(panelPath), panelJson, 'utf8');
  fs.writeFileSync(abs(constantsPath), constantsJson, 'utf8');
  fs.writeFileSync(abs(verdictPath), verdictMd.endsWith('\n') ? verdictMd : verdictMd + '\n', 'utf8');
  return { panelPath, constantsPath, verdictPath, panelBytes: Buffer.byteLength(panelJson), constantsBytes: Buffer.byteLength(constantsJson) };
}

// ─── CLI entry point ──────────────────────────────────────────────────────────

/** The `--qb-rookie-level` branch body of `bin/backtest.mjs`. Returns the exit code: 1 on CoverageStop/SnapshotStop, else 0. */
export function qbRookieLevelMain({
  load = QB_ROOKIE_LOAD, write = false, asJson = false, writeArtifacts = writeQbRookieLevelArtifacts,
  log = console.log, logErr = console.error,
} = {}) {
  try {
    const result = runQbRookieLevel({ load, log: (m) => logErr(`[backtest] ${m}`) });
    const verdictMd = buildQbRookieLevelVerdictMarkdown(result);
    if (write) {
      const w = writeArtifacts({ result, verdictMd });
      logErr(`[backtest] Wrote ${w.panelPath} (${w.panelBytes} B), ${w.constantsPath} (${w.constantsBytes} B), ${w.verdictPath}`);
    }
    log(asJson ? JSON.stringify(result, null, 2) : verdictMd);
    return 0;
  } catch (err) {
    if (err instanceof CoverageStop || err instanceof SnapshotStop) {
      logErr(`[backtest] ${err.message}`);
      return 1;
    }
    throw err;
  }
}
