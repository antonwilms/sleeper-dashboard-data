#!/usr/bin/env node
/**
 * scripts/fixtures/build-learned-fixtures.mjs — builds test/fixtures/learned-panel/*.json from completed-season rows
 * (Invariant 10: tests pin to fixtures, never to live files). Offline; reads the served stores, writes only the fixtures.
 * Run: node scripts/fixtures/build-learned-fixtures.mjs
 */
import fs from 'node:fs';
import { repoPath } from '../../lib/io.mjs';
import { buildLearnedLoad, prePass } from '../learned-panel-run.mjs';
import { seasonEmitsFirstDownBonus } from '../../lib/fantasyPoints.mjs';

const OUT = 'test/fixtures/learned-panel';
fs.mkdirSync(repoPath(OUT), { recursive: true });
const put = (name, v) => fs.writeFileSync(repoPath(`${OUT}/${name}.json`), JSON.stringify(v, null, 1) + '\n');

const g = buildLearnedLoad();
const scoring = g.loadLeagueScoring();
const positionOf = g.loadLeaguePositionOf();
const SKILL = new Set(['QB', 'RB', 'WR', 'TE']);
const { keys } = prePass(g, scoring, positionOf);

// ── 1. scoring weeks: played weeks 2016 (first downs derived) and 2023 (first downs emitted), incl. 100-yd bonus weeks
const weeks = [];
for (const S of [2016, 2023]) {
  const totals = g.loadSeasonTotals(S);
  const derive = !seasonEmitsFirstDownBonus(totals);
  const picked = { QB: 0, RB: 0, WR: 0, TE: 0, bonus: 0 };
  for (const [pid, row] of Object.entries(totals)) {
    if (pid.startsWith('TEAM_') || !SKILL.has(positionOf(pid)) || !row.weeklyStats) continue;
    const position = positionOf(pid);
    for (const [w, sw] of Object.entries(row.weeklyStats)) {
      if (row.weeklyStatus?.[Number(w) - 1] !== 'P') continue;
      const isBonus = sw.rec_yd >= 100 || sw.rush_yd >= 100;
      if (isBonus && picked.bonus < 4) { picked.bonus++; weeks.push({ S, pid, position, w: Number(w), derive, stats: sw }); }
      else if (picked[position] < 5 && (sw.rec_fd || sw.rush_fd || sw.pass_fd)) { picked[position]++; weeks.push({ S, pid, position, w: Number(w), derive, stats: sw }); }
    }
  }
}
put('scoring-weeks', { keys, weights: Object.fromEntries(keys.map(k => [k, scoring[k]])), weeks });

// ── 2. team domain: a 2015 STL RB and a 2019 OAK WR (era team codes) + the 2016 CAR@DEN opener
const sliceSeason = (S, team, pos, weeksKeep) => {
  const totals = g.loadSeasonTotals(S);
  const roster = g.loadRosterWeekly(S).players;
  const pid = Object.keys(totals).find(p => !p.startsWith('TEAM_') && totals[p].team === team && positionOf(p) === pos && totals[p].gamesPlayed >= 10 && roster[p]);
  const row = totals[pid];
  const keep = (o) => Object.fromEntries(Object.entries(o ?? {}).filter(([w]) => weeksKeep.includes(Number(w))));
  const games = g.loadSchedule(S).games.filter(x => x.gameType === 'REG' && x.week <= Math.max(...weeksKeep) && (x.homeTeam === team || x.awayTeam === team));
  return {
    S, team, pid, position: pos,
    totals: { [pid]: { team: row.team, gamesPlayed: row.gamesPlayed, fantasyPoints: row.fantasyPoints, weeklyStatus: row.weeklyStatus, weeklyStats: keep(row.weeklyStats) } },
    rosterPlayers: { [pid]: keep(roster[pid]) },
    games,
  };
};
const opener = g.loadSchedule(2016).games.find(x => x.gameId === '2016_01_CAR_DEN');
put('team-domain', { stl2015: sliceSeason(2015, 'STL', 'RB', [1, 2, 3]), oak2019: sliceSeason(2019, 'OAK', 'WR', [1, 2, 3]), opener });

// ── 3. depth slots with a null pid inside the array (SEA 2016 wk1 TE leads with null; CHI 2019 wk1 TE has an inner null)
const depthSlot = (S, w, team, pos) => ({ S, w, team, pos, arr: g.loadDepth(S).weeks[w][team][pos] });
put('depth-slots', { sea2016: depthSlot(2016, 1, 'SEA', 'TE'), chi2019: depthSlot(2019, 1, 'CHI', 'TE') });

// ── 4. B2 predicate: career rows (gamesPlayed + league fantasyPoints only) for 2018–2020
const career = {};
for (const y of [2018, 2019, 2020]) {
  career[y] = {};
  for (const [pid, r] of Object.entries(g.loadSeasonTotals(y))) {
    if (pid.startsWith('TEAM_') || !SKILL.has(positionOf(pid))) continue;
    career[y][pid] = { gamesPlayed: r.gamesPlayed, fantasyPoints: r.fantasyPoints };
  }
}
const pids = [...new Set([...Object.keys(career[2019]), ...Object.keys(career[2020])])].sort().slice(0, 400);
for (const y of Object.keys(career)) career[y] = Object.fromEntries(pids.filter(p => career[y][p]).map(p => [p, career[y][p]]));
career[2019].EDGE_LOW = { gamesPlayed: 7, fantasyPoints: 90 };       // gp 7 → not qualifying
career[2020].EDGE_LOW = { gamesPlayed: 8, fantasyPoints: 96 };       // gp 8 → qualifying
career[2019].EDGE_NAN = { gamesPlayed: 12, fantasyPoints: null };    // non-finite → not qualifying
career[2020].EDGE_NAN = { gamesPlayed: 12, fantasyPoints: 120 };
put('b2-career', { forecastSeason: 2021, career });
console.log(`[fixtures] wrote ${OUT}: ${keys.length} keys, ${weeks.length} scoring weeks, ${pids.length} career pids`);
