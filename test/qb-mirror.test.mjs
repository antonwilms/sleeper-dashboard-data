/**
 * test/qb-mirror.test.mjs — qb-inseason-refit: the QB depth step (boundary 5), the preseason start share (boundary 5)
 * and the rookie QB starter level (boundary 6) mirrored into the data repo, held exact against the real captures
 * either side of each boundary. Task: .claude/tasks/qb-inseason-refit.md §3 A1.6 (T-QB-1..5).
 *
 * Fixtures are committed files; their presence is asserted, never skipped (T-S4-1 precedent).
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import {
  reconstructDepthFactor, DEPTH_MODELS, CURRENT_DEPTH_MODEL,
  pinnedQbChainModels, reconstructQbPreseasonShares,
} from '../lib/projectionFactors.mjs';
import {
  QB_ROOKIE_STARTER_PPG, ROOKIE_QB_MODELS, CURRENT_ROOKIE_QB_MODEL,
  resolveRookieQbStarterLevel, reconstructShippedRookieProjection,
} from '../lib/rookieMirror.mjs';
import { priorPPG } from '../lib/qbTakeover.mjs';
import { calculateFantasyPoints } from '../lib/fantasyPoints.mjs';

const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));
const readJson = (rel) => {
  const abs = path.join(REPO_ROOT, rel);
  assert.ok(fs.existsSync(abs), `fixture present: ${rel}`);
  return JSON.parse(fs.readFileSync(abs, 'utf8'));
};

const round3 = (x) => Math.round(x * 1000) / 1000;
const round4 = (x) => Math.round(x * 10000) / 10000;

// The QB set: ids the 2026-10-04 capture classifies (`qbTakeoverBasis` ≠ 'none'); veterans = not rookie-path.
function qbRows(snap) {
  const out = [];
  for (const [id, p] of Object.entries(snap.players)) {
    const f = p.projection?.factors;
    if (f?.qbTakeoverBasis && f.qbTakeoverBasis !== 'none') out.push({ id, p, f, rookiePath: p.projection.confidence === 'rookie' });
  }
  return out;
}

describe('T-QB-1: reconstructDepthFactor by model', () => {
  test('the model table: both models × {QB, RB, null position} × orders × stale', () => {
    assert.deepEqual([...DEPTH_MODELS], ['legacy', 'qb-takeover']);
    assert.equal(CURRENT_DEPTH_MODEL, 'qb-takeover');
    const legacyOf = (order, stale) => {
      if (order != null && order >= 2 && stale) return 1.00;
      if (order === 1) return 1.05;
      if (order === 2) return 0.88;
      if (order != null && order >= 3) return 0.68;
      return 1.00;
    };
    for (const model of DEPTH_MODELS) {
      for (const position of ['QB', 'RB', null]) {
        for (const order of [null, 1, 2, 3, 7]) {
          for (const stale of [true, false]) {
            const got = reconstructDepthFactor(order, stale, { position, model });
            let want = legacyOf(order, stale);
            if (model === 'qb-takeover' && position === 'QB') want = (order === 1 && !(order >= 2 && stale)) ? 1.05 : 1.00;
            assert.equal(got, want, `${model} ${position} order=${order} stale=${stale}`);
          }
        }
      }
    }
  });

  test('an unknown model throws; a two-argument call equals legacy', () => {
    assert.throws(() => reconstructDepthFactor(2, false, { position: 'QB', model: 'x' }), /unknown depth model/);
    for (const order of [null, 1, 2, 3, 7]) {
      for (const stale of [true, false]) {
        assert.equal(
          reconstructDepthFactor(order, stale, { position: 'QB', model: 'legacy' }),
          // two-argument callers keep the legacy values only when they pass model 'legacy' or no position:
          reconstructDepthFactor(order, stale, { model: 'legacy' }),
        );
        assert.equal(reconstructDepthFactor(order, stale, { position: null }), reconstructDepthFactor(order, stale, { model: 'legacy' }));
      }
    }
  });
});

describe('T-QB-2: depth parity against the captures either side of boundary 5', () => {
  const before = readJson('snapshots/2026-10-03.json');
  const after = readJson('snapshots/2026-10-04.json');
  const qbs = qbRows(after);
  const veterans = qbs.filter(q => !q.rookiePath);

  function check(snap, model) {
    let n = 0;
    const counts = {};
    for (const { id } of veterans) {
      const p = snap.players[id];
      assert.ok(p, `${id} present in the capture`);
      const f = p.projection.factors;
      const got = reconstructDepthFactor(p.depthChartOrder ?? null, f.depthStale === true, { position: 'QB', model });
      assert.equal(got, f.depthFactor, `${id} ${model}`);
      const key = `${f.depthStale ? 'stale' : p.depthChartOrder ?? 'null'}:${got}`;
      counts[key] = (counts[key] ?? 0) + 1;
      n++;
    }
    return { n, counts };
  }

  test('58 veteran QB rows on 2026-10-03 reproduce `legacy` exactly (28 × 1.05, 7 × 0.88, 23 × 1.00)', () => {
    assert.equal(veterans.length, 58);
    const { n, counts } = check(before, 'legacy');
    assert.equal(n, 58);
    const by = (v) => Object.entries(counts).filter(([k]) => k.endsWith(`:${v}`)).reduce((a, [, c]) => a + c, 0);
    assert.equal(by(1.05), 28);
    assert.equal(by(0.88), 7);
    assert.equal(by(1), 23);
  });

  test('the same 58 rows on 2026-10-04 reproduce `qb-takeover` exactly', () => {
    const { n } = check(after, 'qb-takeover');
    assert.equal(n, 58);
  });
});

describe('T-QB-3: start-share parity against 2026-10-04', () => {
  const snap = readJson('snapshots/2026-10-04.json');
  const constants = readJson('backtests/2026-10-03-qb-takeover-constants.json');
  const totals2025 = readJson('nfl/season-totals/2025.json');
  const models = pinnedQbChainModels(constants);
  const qbs = qbRows(snap);

  // iq: S−1 (2025) points rescored to the capture's league scoring, per game, gp ≥ 4 (the app's live ratio).
  const priorOf = (id) => {
    const rec = totals2025[id];
    if (!rec) return null;
    return priorPPG({ gamesPlayed: rec.gamesPlayed, fantasyPoints: calculateFantasyPoints(rec.stats, snap.scoringSettings) });
  };
  const input = qbs.map(({ id, p, f, rookiePath }) => ({
    id, team: p.nfl_team, order: p.depthChartOrder ?? null,
    // rk read from the capture: three undrafted 2026 rookies have no crosswalk entry, so it cannot supply it.
    rookie: rookiePath && String(f.rookieGamesBasis ?? '').endsWith('|0'),
  }));
  const shares = reconstructQbPreseasonShares({ qbs: input, priorOf, models });

  test('every `chain` row reproduces qbStartShare to 4 dp — 54 of 54', () => {
    const chain = qbs.filter(q => q.f.qbTakeoverBasis === 'chain');
    assert.equal(chain.length, 54);
    let ok = 0;
    for (const { id, f } of chain) {
      const r = shares[id];
      assert.equal(r.role, 'backup', `${id} role`);
      assert.equal(round4(r.share), f.qbStartShare, `${id} share`);
      ok++;
    }
    assert.equal(ok, 54);
  });

  test('every captured incumbent is the computed incumbent; captured basis ↔ computed role', () => {
    const counts = { vetStale: 0, vetIncumbent: 0, vetChain: 0, rookieChain: 0, rookieIncumbent: 0 };
    for (const { id, f, rookiePath } of qbs) {
      const r = shares[id];
      const basis = f.qbTakeoverBasis;
      if (basis === 'incumbent') {
        assert.equal(r.role, 'incumbent', `${id}`);
        counts[rookiePath ? 'rookieIncumbent' : 'vetIncumbent']++;
      } else if (basis === 'chain') {
        assert.equal(r.role, 'backup', `${id}`);
        counts[rookiePath ? 'rookieChain' : 'vetChain']++;
      } else if (basis === 'stale') {
        assert.equal(r.role, 'backup', `${id}`);
        assert.equal(f.depthStale, true, `${id} stale ↔ depthStale`);
        counts.vetStale++;
      } else assert.fail(`unexpected basis ${basis}`);
    }
    assert.deepEqual(counts, { vetStale: 20, vetIncumbent: 28, vetChain: 10, rookieChain: 44, rookieIncumbent: 4 });
  });

  test('reconstructQbPreseasonShares: no-team and no-chart roles, median over non-null incumbent priors', () => {
    const models2 = models;
    const out = reconstructQbPreseasonShares({
      qbs: [
        { id: 'a', team: null, order: 1, rookie: false },
        { id: 'b', team: 'FA', order: 1, rookie: false },
        { id: 'c', team: 'X', order: 2, rookie: false },
        { id: 'd', team: 'Y', order: 1, rookie: false },
        { id: 'e', team: 'Y', order: 2, rookie: false },
      ],
      priorOf: () => 20, models: models2,
    });
    assert.equal(out.a.role, 'no-team');
    assert.equal(out.b.role, 'no-team');
    assert.equal(out.c.role, 'no-chart');
    assert.equal(out.d.role, 'incumbent');
    assert.equal(out.e.role, 'backup');
    assert.equal(out.e.incumbentId, 'd');
    assert.equal(out.e.codes.iq, 0); // incumbent prior = the median → neither weak nor strong
    assert.ok(out.e.share > 0 && out.e.share < 1);
    assert.equal(out.e.games, 17);
  });
});

describe('T-QB-4: rookie QB starter level (boundary 6)', () => {
  test('QB_ROOKIE_STARTER_PPG equals the pinned file\'s starterPPG values', () => {
    const file = readJson('backtests/2026-10-04-qb-rookie-level-constants.json');
    // the file also carries a `pooled` row; the app's table is the four draft groups only.
    const want = Object.fromEntries(['top12', 'r1', 'day2', 'day3+'].map((g) => [g, file.starterPPG[g].value]));
    assert.deepEqual(QB_ROOKIE_STARTER_PPG, want);
  });

  test('resolveRookieQbStarterLevel truth table', () => {
    const g = (o) => resolveRookieQbStarterLevel({ position: 'QB', yearsExp: 0, draftCapitalStatus: 'matched', draftRound: 1, draftPick: 5, ...o }).rookieQbGroup;
    assert.equal(g({ draftCapitalStatus: 'undrafted', draftRound: null, draftPick: null }), 'day3+');
    assert.equal(g({ draftPick: 12 }), 'top12');
    assert.equal(g({ draftPick: 13 }), 'r1');
    assert.equal(g({ draftPick: null }), null);
    assert.equal(g({ draftRound: 2, draftPick: 3 }), 'day2');
    assert.equal(g({ draftRound: 3, draftPick: 3 }), 'day2');
    assert.equal(g({ draftRound: 4 }), 'day3+');
    assert.equal(g({ draftRound: 7 }), 'day3+');
    assert.equal(g({ yearsExp: 1 }), null);
    assert.equal(g({ position: 'RB' }), null);
    assert.equal(g({ draftCapitalStatus: 'unknown' }), null);
    const lvl = resolveRookieQbStarterLevel({ position: 'QB', yearsExp: 0, draftCapitalStatus: 'matched', draftRound: 1, draftPick: 3 });
    assert.deepEqual(lvl, { rookieQbGroup: 'top12', rookieQbLevel: 15.801 });
  });

  test('reconstructShippedRookieProjection: projections identical under both models; qbStarter* additive', () => {
    assert.deepEqual([...ROOKIE_QB_MODELS], ['legacy', 'rookie-qb-level']);
    assert.equal(CURRENT_ROOKIE_QB_MODEL, 'rookie-qb-level');
    const base = { position: 'QB', ageAtDraft: 21.5, draftRound: 1, draftPick: 3, draftCapitalStatus: 'matched', yearsExp: 0 };
    const a = reconstructShippedRookieProjection({ ...base, rookieQbModel: 'rookie-qb-level' });
    const b = reconstructShippedRookieProjection({ ...base, rookieQbModel: 'legacy' });
    for (const k of ['projectedPPG', 'projectedTotalPts', 'projectedGames', 'appliedCorrections', 'rookieCeilingPPGPre']) {
      assert.deepEqual(a[k], b[k], k);
    }
    assert.equal(a.qbStarterPPG, 15.801);
    assert.equal(a.qbStarterBasis, 'rookie:top12');
    assert.equal(a.rookieQbGroup, 'top12');
    assert.equal(b.qbStarterBasis, 'projection');
    assert.equal(b.rookieQbGroup, null);
    // legacy = the unrounded ceiled level: it rounds to projectedPPG at 1 dp.
    assert.equal(Math.round(b.qbStarterPPG * 10) / 10, b.projectedPPG);
    assert.notEqual(b.qbStarterPPG, 15.801);
    const rb = reconstructShippedRookieProjection({ ...base, position: 'RB' });
    assert.equal(rb.qbStarterPPG, null);
    assert.equal(rb.qbStarterBasis, null);
    assert.equal(rb.rookieQbGroup, null);
    assert.throws(() => reconstructShippedRookieProjection({ ...base, rookieQbModel: 'x' }), /unknown rookie QB model/);
  });

  test('every 2026-10-04 row with qbStarterBasis rookie:<g> carries round3(level × rookieBasisScale) — 17 rows', () => {
    const snap = readJson('snapshots/2026-10-04.json');
    let n = 0;
    for (const [id, p] of Object.entries(snap.players)) {
      const f = p.projection?.factors;
      const m = /^rookie:(.+)$/.exec(f?.qbStarterBasis ?? '');
      if (!m) continue;
      assert.ok(f.rookieBasisScale > 0, `${id} has rookieBasisScale`);
      assert.equal(f.qbStarterPPG, round3(QB_ROOKIE_STARTER_PPG[m[1]] * f.rookieBasisScale), `${id}`);
      n++;
    }
    assert.equal(n, 17);
  });
});

describe('T-QB-5: pinnedQbChainModels', () => {
  test('the 2026-10-03 file loads', () => {
    const file = readJson('backtests/2026-10-03-qb-takeover-constants.json');
    const m = pinnedQbChainModels(file);
    assert.deepEqual(m.hazard.keys, file.hazard.features);
    assert.deepEqual(m.stick.keys, file.stickiness.features);
    assert.equal(m.hazard.coef, file.hazard.coef);
    assert.equal(m.source, file.source);
  });

  test('a hazard feature the mirror does not build throws; so does a stickiness one', () => {
    const file = readJson('backtests/2026-10-03-qb-takeover-constants.json');
    assert.throws(() => pinnedQbChainModels({ ...file, hazard: { ...file.hazard, features: [...file.hazard.features, 'dg'] } }), /hazard feature 'dg'/);
    assert.throws(() => pinnedQbChainModels({ ...file, stickiness: { ...file.stickiness, features: ['st', 'dg3'] } }), /stickiness feature 'dg3'/);
  });
});
