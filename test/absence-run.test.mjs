/**
 * test/absence-run.test.mjs — the `--absence` harness (absence-classification-b.md §5).
 * Synthetic stores with injected loaders; no live data.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';

import { projectedGamesFor } from '../lib/durabilityMirror.mjs';
import { computeAvailability } from '../lib/sleeper.mjs';
import {
  correctStore, buildPanel, recommend, parityReport, absenceMain, writeAbsenceArtifacts, ABSENCE_DEFAULTS,
} from '../scripts/absence-run.mjs';

const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));

// ─── synthetic store ─────────────────────────────────────────────────────────

const teamRow = (n) => ({ team: 'KC', weeklyStatus: Array(n).fill('P') });
const emptyRw = { players: {} };

/** A 13-slot season for P (WR, KC): 9 played; weeks 5-6 'D' (dnp 2); weeks 7-8 'X'. gp 9, 9 starts. */
function shortSeason({ dnp }) {
  const ws = ['P', 'P', 'P', 'P', 'D', 'D', 'X', 'X', 'P', 'P', 'P', 'P', 'P'];
  return { team: 'KC', gamesPlayed: 9, gamesStarted: 9, fantasyPoints: 90, dnpWeeks: dnp, weeklyStatus: ws, stats: {} };
}
const fullSeason = () => ({ team: 'KC', gamesPlayed: 16, gamesStarted: 16, fantasyPoints: 160, dnpWeeks: 0, weeklyStatus: Array(16).fill('P'), stats: {} });
/** Adds the availability the real aggregator would have written. */
const finish = (r) => ({ ...r, availability: computeAvailability(r.weeklyStatus) });

/** KC weeks 7 and 8 INA in the 2018 roster file: converts the two 'X' slots. */
const rw2018 = { players: { P: { 7: [['KC', 'INA']], 8: [['KC', 'INA']] } } };

function storeFor({ secondInjury }) {
  const s2017 = secondInjury ? { ...shortSeason({ dnp: 3 }), weeklyStatus: ['P', 'P', 'P', 'P', 'D', 'D', 'D', 'P', 'P', 'P', 'P', 'P', 'P'] } : fullSeason();
  const t = (n) => ({ TEAM_KC: teamRow(n) });
  const before = {
    2017: { ...t(16), P: finish(s2017) },
    2018: { ...t(13), P: finish(shortSeason({ dnp: 2 })) },
    2019: { ...t(16), P: finish(fullSeason()) },
  };
  const rosterByYear = { 2017: emptyRw, 2018: rw2018, 2019: emptyRw };
  return { before, rosterByYear };
}

// ─── AR-1 ────────────────────────────────────────────────────────────────────

test('AR-1: two corrected slots cross dnp ≥ 3 → injurySeasons 0 → 1; projectedGames moves only with a second injury season', () => {
  // Case 1 — a single injury season: the ≥2 rule does not bite, projectedGames is unchanged.
  const one = storeFor({ secondInjury: false });
  const { after: a1, corrections } = correctStore(one.before, one.rosterByYear, { from: 2017, to: 2019 });
  assert.deepEqual(a1[2018].P.weeklyStatus.slice(6, 8), ['D', 'D']);
  assert.equal(a1[2018].P.dnpWeeks, 4);
  assert.equal(corrections.find((c) => c.season === 2018).changedSlots, 2);
  const b = projectedGamesFor(one.before, 'P', 'WR', { throughSeason: 2019 });
  const a = projectedGamesFor(a1, 'P', 'WR', { throughSeason: 2019 });
  assert.equal(b.injurySeasons, 0);
  assert.equal(a.injurySeasons, 1);
  assert.equal(b.projectedGames, a.projectedGames);

  // Case 2 — 2017 is already an injury season, so the correction makes it two → ×0.88.
  const two = storeFor({ secondInjury: true });
  const { after: a2 } = correctStore(two.before, two.rosterByYear, { from: 2017, to: 2019 });
  const b2 = projectedGamesFor(two.before, 'P', 'WR', { throughSeason: 2019 });
  const x2 = projectedGamesFor(a2, 'P', 'WR', { throughSeason: 2019 });
  assert.equal(b2.injurySeasons, 1);
  assert.equal(x2.injurySeasons, 2);
  assert.ok(x2.projectedGames < b2.projectedGames, `${x2.projectedGames} should be below ${b2.projectedGames}`);
});

// ─── AR-2 ────────────────────────────────────────────────────────────────────

test('AR-2: no S+1 row → outcome 0 only when the roster lists a missed-games status; otherwise excluded', () => {
  const season = (id) => ({ [id]: finish(fullSeason()) });
  const before = {
    2017: { ...season('A'), ...season('B'), ...season('C'), ...season('D') },
    2018: { ...season('A'), ...season('B'), ...season('C'), ...season('D') },
    2019: { ...season('D') },
  };
  const rosterByYear = {
    2017: emptyRw, 2018: emptyRw,
    2019: { players: { A: { 1: [['KC', 'RES']] }, B: { 1: [['KC', 'DEV']] } } },   // C: no roster row at all
  };
  const defaults = { ...ABSENCE_DEFAULTS, predictorSeasons: { from: 2018, to: 2018 } };
  const positionOf = { A: 'WR', B: 'WR', C: 'WR', D: 'WR' };
  const draftYearOf = { A: 2010, B: 2010, C: 2010, D: 2010 };
  const { rows, counts } = buildPanel({ before, after: before, rosterByYear, positionOf, draftYearOf, defaults });
  const byId = Object.fromEntries(rows.map((r) => [r.id, r]));
  assert.equal(byId.A.outcome, 0, 'reserve-listed, no row → included at 0');
  assert.equal(byId.B, undefined, 'DEV only → excluded');
  assert.equal(byId.C, undefined, 'no roster row → excluded');
  assert.equal(byId.D.outcome, 16, 'a normal S+1 row');
  assert.equal(counts.includedZeroOutcome, 1);
  assert.equal(counts.excludedNoRowNoReserve, 2);
});

test('AR-2b: a player drafted in S is not yet a veteran at S+1', () => {
  const before = { 2017: { R: finish(fullSeason()) }, 2018: { R: finish(fullSeason()) } };
  const rosterByYear = { 2017: emptyRw, 2018: emptyRw };
  const defaults = { ...ABSENCE_DEFAULTS, predictorSeasons: { from: 2017, to: 2017 } };
  const mk = (draftYear) => buildPanel({ before, after: before, rosterByYear, positionOf: { R: 'RB' }, draftYearOf: { R: draftYear }, defaults });
  assert.equal(mk(2017).rows.length, 0);
  assert.equal(mk(2017).counts.notVeteran, 1);
  assert.equal(mk(2016).rows.length, 1);
});

// ─── recommendation rule ─────────────────────────────────────────────────────

test('recommend: parity < min → (c); CI wholly above 0 → (b); otherwise (a)', () => {
  assert.equal(recommend({ parityRate: 0.98, parityMin: 0.99, ci: [-1, -0.5] }).outcome, 'c');
  assert.equal(recommend({ parityRate: 1, parityMin: 0.99, ci: [0.01, 0.05] }).outcome, 'b');
  assert.equal(recommend({ parityRate: 1, parityMin: 0.99, ci: [-0.02, 0.01] }).outcome, 'a');
  assert.equal(recommend({ parityRate: 1, parityMin: 0.99, ci: [-0.02, -0.01] }).outcome, 'a');
  assert.equal(recommend({ parityRate: 1, parityMin: 0.99, ci: null }).outcome, 'c');
});

// ─── AR-3 ────────────────────────────────────────────────────────────────────

/** A full synthetic load whose parity fixture is generated from the mirror itself (100% parity). */
function syntheticLoad({ breakParity = false } = {}) {
  const { before, rosterByYear } = storeFor({ secondInjury: true });
  const careerStats = Object.fromEntries(Object.entries(before).map(([y, t]) => [y, { P: t.P }]));
  const m = projectedGamesFor(careerStats, 'P', 'WR', { throughSeason: 2025 });
  const fixture = {
    sourceRev: 'synthetic', snapshot: '2026-10-04', positions: { P: 'WR' },
    snapshotRows: { P: { projectedGames: m.projectedGames + (breakParity ? 1 : 0), injurySeasons: m.injurySeasons, absenceShapeFactor: Math.round(m.absenceShapeFactor * 1000) / 1000, isBounceBack: false } },
    seasons: careerStats,
  };
  return {
    loadManifest: () => ({ files: {} }),
    loadSeasonTotals: (y) => before[y] ?? null,
    loadRosterWeekly: (y) => rosterByYear[y] ?? null,
    loadPlayerIds: () => ({ ids: { gP: { sleeperId: 'P', position: 'WR' } }, bySleeper: { P: { draftYear: 2010 } } }),
    loadSnapshot: () => ({ players: { P: { projection: { confidence: 'high' } } } }),
    loadPlayersRaw: () => ({ P: { full_name: 'Pat Player' } }),
    loadParityFixture: () => fixture,
  };
}
const smallDefaults = { ...ABSENCE_DEFAULTS, seasons: { from: 2017, to: 2019 }, predictorSeasons: { from: 2018, to: 2018 }, bootstrap: { resamples: 200, seed: 1 } };

test('AR-3: absenceMain runs end to end; --write hands both dated artifacts to the writer', () => {
  const logs = [], errs = [], writes = [];
  const code = absenceMain({
    load: syntheticLoad(), defaults: smallDefaults, write: true,
    writeArtifacts: (a) => { writes.push(a); return { panelPath: 'p', verdictPath: 'v', panelBytes: 1 }; },
    log: (m) => logs.push(m), logErr: (m) => errs.push(m),
  });
  assert.equal(code, 0);
  assert.equal(writes.length, 1);
  assert.match(writes[0].verdictMd, /## 7\. Recommendation/);
  assert.equal(writes[0].result.parity.dm1.rate, 1);
  assert.match(logs.join('\n'), /## 3\. Primary result/);
});

test('AR-3: parity below 99% stops with exit 1 and writes nothing', () => {
  const writes = [], errs = [];
  const code = absenceMain({
    load: syntheticLoad({ breakParity: true }), defaults: smallDefaults, write: true,
    writeArtifacts: (a) => { writes.push(a); return {}; }, log: () => {}, logErr: (m) => errs.push(m),
  });
  assert.equal(code, 1);
  assert.equal(writes.length, 0);
  assert.match(errs.join('\n'), /parity .* below 99%/);
});

test('AR-3: writeAbsenceArtifacts writes both artifacts at the dated paths under the given root', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'absence-'));
  const result = { meta: { generatedAt: '2026-10-06T12:00:00.000Z' }, x: 1 };
  const w = writeAbsenceArtifacts({ result, verdictMd: '# v', root });
  assert.equal(w.panelPath, 'backtests/2026-10-06-absence-panel.json');
  assert.equal(w.verdictPath, 'grading/2026-10-06-absence-verdict.md');
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(root, w.panelPath), 'utf8')), result);
  assert.equal(fs.readFileSync(path.join(root, w.verdictPath), 'utf8'), '# v\n');
});

test('AR-3: the CLI rejects an unknown flag with exit 1 and a message naming it', () => {
  const r = spawnSync(process.execPath, ['bin/backtest.mjs', '--absence', '--bogus'], { cwd: REPO_ROOT, encoding: 'utf8' });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /--absence rejects --bogus/);
});

test('parityReport: counts rows with no qualifying season separately instead of failing them', () => {
  const fx = { snapshotRows: { Q: { projectedGames: 12, injurySeasons: 0, absenceShapeFactor: 1 } }, positions: { Q: 'RB' }, seasons: { 2025: { Q: { gamesPlayed: 3, gamesStarted: 0, fantasyPoints: 9, dnpWeeks: 0, stats: {} } } } };
  const r = parityReport(fx);
  assert.equal(r.rows, 0);
  assert.equal(r.noQualifying, 1);
});
