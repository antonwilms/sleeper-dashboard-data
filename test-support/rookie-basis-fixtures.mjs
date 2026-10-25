/**
 * test-support/rookie-basis-fixtures.mjs — in-memory rookie fixtures shared by test/rookie-basis-panels.test.mjs and
 * test/season-grade-b.test.mjs (P3 Slice B §11). Hoisted unchanged from test/rookie-basis-panels.test.mjs; no I/O (Invariant 10).
 */

import { reconstructRookieProjection } from '../lib/projectionFactors.mjs';

const LEAGUE_SCORING = { rec: 1, rec_yd: 0.1, rec_td: 6, rush_yd: 0.1 };
export function memLoad() {
  const seasons = {
    2020: {
      p1: { fantasyPoints: 160, gamesPlayed: 16, stats: { rec: 80, rec_yd: 1000, rec_td: 6 } },
      p2: { fantasyPoints: 20, gamesPlayed: 5, stats: { rush_yd: 100, rec: 5 } },
    },
    2021: {
      p1: { fantasyPoints: 200, gamesPlayed: 16, stats: { rec: 100, rec_yd: 1300, rec_td: 8 } },
      p2: { fantasyPoints: 70, gamesPlayed: 10, stats: { rush_yd: 400, rec: 20 } },
    },
  };
  const ids = {
    ids: { g1: { sleeperId: 'p1', position: 'WR' }, g2: { sleeperId: 'p2', position: 'RB' } },
    bySleeper: {
      p1: { birthdate: '1998-03-01', draftYear: 2020, draftRound: 1, draftPick: 5, undrafted: false },
      p2: { birthdate: '1998-03-01', draftYear: 2020, draftRound: null, draftPick: null, undrafted: true },
    },
  };
  return {
    loadSeasonTotals: (y) => seasons[y] ?? null, loadAdvstats: () => null, loadRoster: () => null,
    loadPlayerIds: () => ids,
    loadLeagueScoring: () => LEAGUE_SCORING,
    loadLeaguePositionOf: () => (pid) => ({ p1: 'WR', p2: 'RB' }[pid] ?? null),
  };
}

export const row = (over = {}) => {
  const base = { sleeperId: 'w1', position: 'WR', draftYear: 2020, draftRound: null, draftPick: null, draftGroup: 'undrafted', experienceYears: 0, experienceBucket: '0', targetSeason: 2020, outcomeGames: 4, outcomeTotalPts: 20 };
  return { ...base, projectedPPG: reconstructRookieProjection({ position: 'WR', ageAtDraft: 22, draftRound: null, draftPick: null }).projectedPPG, ...over };
};

// 40 WR rows (gp >= 10) in 2019 whose league points are 1.1× the served points → basisScaleAsOf(2020).WR === 1.1
export function leagueStub(panelRows) {
  const wr = {};
  for (let i = 0; i < 40; i++) wr[`s${i}`] = { fantasyPoints: 100, gamesPlayed: 16, scoringBasis: 'half_ppr', stats: { rec_yd: 1100 } };
  return {
    loadPanel: () => { throw new Error('the pinned half panel must not be read under league'); },
    loadLeaguePanel: (p) => ({ meta: { basis: 'league' }, rookiePathAll: { rows: panelRows }, panelPath: p }),
    loadPlayerIds: () => ({ bySleeper: { w1: { birthdate: '1998-01-01' } } }),
    loadSeasonTotals: (y) => (y === 2019 ? wr : null),
    loadLeagueScoring: () => ({ rec_yd: 0.1 }),
    loadLeaguePositionOf: () => () => 'WR',
  };
}
