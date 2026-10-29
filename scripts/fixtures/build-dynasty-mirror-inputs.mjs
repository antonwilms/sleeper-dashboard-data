#!/usr/bin/env node
/**
 * scripts/fixtures/build-dynasty-mirror-inputs.mjs — one-off builder for the S3a golden parity inputs
 * (task .claude/tasks/dynasty-history-mirror.md §6.1). Committed for provenance; re-run only when the
 * fixture must be regenerated.
 *
 * For S ∈ {2019, 2023} it calls buildAsOfInputs(load, S, { curveAgeMode: 'birthdate', gamesMode: 'sleeper' })
 * and writes test/fixtures/dynasty-mirror-parity/inputs-<S>.json: a trimmed universe (every skill pid whose
 * S or S−1 row `team` is one of 16 teams, all of that pid's seasons 2012…S, plus every TEAM_* row), slimmed
 * rows, the app-shaped depthMap. The expected-<S>.json goldens are made by the APP's own code
 * (sleeper-dashboard scripts/verify/dynasty-golden.mjs) from these inputs.
 *
 *   node scripts/fixtures/build-dynasty-mirror-inputs.mjs
 * Exit 1 (nothing written) on a pre-check failure or if both files exceed 3 MB.
 */
import fs from 'node:fs';
import { repoPath, writeJsonStable } from '../../lib/io.mjs';
import { DYNASTY_ASOF_LOAD, buildAsOfInputs, SKILL } from '../dynasty-asof.mjs';
import { dynastyScoreMirror } from '../../lib/dynastyMirror.mjs';

export const GOLDEN_SEASONS = [2019, 2023];
export const GOLDEN_TEAMS = ['ATL', 'BUF', 'CHI', 'DAL', 'DEN', 'GB', 'KC', 'LA', 'MIN', 'NE', 'NYG', 'PHI', 'PIT', 'SEA', 'SF', 'TB'];
export const ROW_KEYS = ['gamesPlayed', 'gamesStarted', 'dnpWeeks', 'fantasyPoints', 'sourceFantasyPoints', 'sourceScoringBasis', 'team'];
export const STAT_KEYS = [
  'rush_att', 'rush_yd', 'rec', 'rec_yd', 'rec_tgt', 'rush_rz_att', 'rec_rz_tgt', 'pass_att', 'pass_yd',
  'off_snp', 'tm_off_snp', 'rush_td', 'rec_td', 'pass_td', 'rush_2pt', 'rec_2pt', 'pass_2pt',
  'def_td', 'def_st_td', 'st_td', 'fum_rec_td',
];
export const MAX_BYTES = 3 * 1024 * 1024;
const OUT_DIR = 'test/fixtures/dynasty-mirror-parity';

function slimRow(row) {
  const out = {};
  for (const k of ROW_KEYS) if (row[k] !== undefined) out[k] = row[k];
  const stats = {};
  for (const k of STAT_KEYS) if (row.stats?.[k] !== undefined) stats[k] = row.stats[k];
  out.stats = stats;
  return out;
}

/** Trimmed, slimmed inputs for one season; also returns the mirror-routing path counts for the pre-checks. */
export function buildGoldenInputs(load, S) {
  const full = buildAsOfInputs(load, S, { curveAgeMode: 'birthdate', gamesMode: 'sleeper' });
  const teams = new Set(GOLDEN_TEAMS);
  const keep = new Set();
  for (const pid of full.skillPids) {
    const t = full.careerStats[S]?.[pid]?.team, t1 = full.careerStats[S - 1]?.[pid]?.team;
    if (teams.has(t) || teams.has(t1)) keep.add(pid);
  }
  const careerStats = {};
  for (const [season, rows] of Object.entries(full.careerStats)) {
    const out = {};
    for (const [pid, row] of Object.entries(rows)) {
      if (pid.startsWith('TEAM_') || keep.has(pid)) out[pid] = slimRow(row);
    }
    careerStats[season] = out;
  }
  const playersMap = {};
  const depthMap = {};
  for (const pid of [...keep].sort()) {
    playersMap[pid] = full.playersMap[pid];
    if (full.depthMap[pid]) depthMap[pid] = full.depthMap[pid];
  }
  const inputs = {
    S, currentYear: full.currentYear, scoringSettings: full.scoringSettings, playersMap, depthMap, careerStats,
  };

  // pre-checks with the mirror's own routing (the app's output does not exist yet)
  const bundle = full.curveBundle;
  const counts = {};
  for (const pos of SKILL) counts[pos] = { B: 0, C: 0, other: 0 };
  for (const pid of Object.keys(playersMap)) {
    const r = dynastyScoreMirror(pid, playersMap, careerStats, bundle.curves, bundle.positionPeakPPG, null,
      full.scoringSettings, null, full.teamContext, depthMap, full.historicalShares, bundle.positionPeakAge, bundle.positionBasisScale, null, null, {});
    const pos = playersMap[pid].position;
    if (r.components) counts[pos][r.signals.seasonsOfData <= 2 ? 'B' : 'C']++;
    else counts[pos].other++;
  }
  const teamsPresent = new Set(Object.values(careerStats[S] ?? {}).map(r => r.team));
  const depthByPos = {};
  for (const pos of SKILL) depthByPos[pos] = Object.keys(depthMap).filter(pid => playersMap[pid].position === pos).length;
  return { inputs, counts, teamsPresent: GOLDEN_TEAMS.filter(t => teamsPresent.has(t)), depthByPos, universe: Object.keys(playersMap).length };
}

export function precheckProblems(S, b) {
  const problems = [];
  for (const pos of SKILL) {
    if (b.counts[pos].B < 5) problems.push(`${S} ${pos}: ${b.counts[pos].B} Path B rows < 5`);
    if (b.counts[pos].C < 15) problems.push(`${S} ${pos}: ${b.counts[pos].C} Path C rows < 15`);
    if (b.depthByPos[pos] < 1) problems.push(`${S} ${pos}: no depthMap entry`);
  }
  if (b.teamsPresent.length !== GOLDEN_TEAMS.length) problems.push(`${S}: only ${b.teamsPresent.length}/${GOLDEN_TEAMS.length} teams present in season ${S}`);
  return problems;
}

function main() {
  const built = GOLDEN_SEASONS.map(S => ({ S, ...buildGoldenInputs(DYNASTY_ASOF_LOAD, S) }));
  const problems = built.flatMap(b => precheckProblems(b.S, b));
  for (const b of built) {
    console.error(`[fixture] ${b.S}: universe ${b.universe} pids; mirror-routed counts ${JSON.stringify(b.counts)}; depth entries ${JSON.stringify(b.depthByPos)}; teams ${b.teamsPresent.join(',')}`);
  }
  if (problems.length) {
    console.error(`[fixture] STOP — pre-checks failed:\n  ${problems.join('\n  ')}`);
    process.exit(1);
  }
  const sizes = built.map(b => Buffer.byteLength(JSON.stringify(b.inputs)));
  const total = sizes.reduce((a, b) => a + b, 0);
  console.error(`[fixture] sizes: ${sizes.join(' + ')} = ${total} bytes (cap ${MAX_BYTES})`);
  if (total > MAX_BYTES) {
    console.error('[fixture] STOP — inputs exceed 3 MB; do not shrink the universe without a fix pass');
    process.exit(1);
  }
  fs.mkdirSync(repoPath(OUT_DIR), { recursive: true });
  for (const b of built) writeJsonStable(`${OUT_DIR}/inputs-${b.S}.json`, b.inputs, { minify: true });
  console.error('[fixture] wrote inputs files');
}

import { fileURLToPath } from 'node:url';
import path from 'node:path';
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) main();
