#!/usr/bin/env node
/**
 * scripts/advstats-baseline.mjs — one-shot capture of served nflverse/advstats/<year>.json
 * summary stats before the advstats-grain-and-share.md re-ingest overwrites them. Read-only.
 * Output is the comparison artifact §4 step 1 requires — commit it before re-ingesting.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, '..');
const dir = path.join(repoRoot, 'nflverse/advstats');

const years = fs.readdirSync(dir).filter(f => f.endsWith('.json')).map(f => parseInt(f, 10)).sort((a, b) => a - b);

const rows = [];
for (const year of years) {
  const data = JSON.parse(fs.readFileSync(path.join(dir, `${year}.json`), 'utf8'));
  let targets = 0, airYards = 0, nonNullShare = 0, maxWeeks = 0;
  for (const p of Object.values(data.players)) {
    targets += p.components?.targets ?? 0;
    airYards += p.components?.airYards ?? 0;
    if (p.airYardsShare !== null && p.airYardsShare !== undefined) nonNullShare++;
    if ((p.components?.weeks ?? 0) > maxWeeks) maxWeeks = p.components.weeks;
  }
  const ayPerTarget = targets > 0 ? airYards / targets : null;
  rows.push({
    year,
    generatedAt: data.generatedAt,
    rowCount: data.rowCount,
    playersCount: Object.keys(data.players).length,
    sumTargets: targets,
    sumAirYards: airYards,
    ayPerTarget: ayPerTarget !== null ? Math.round(ayPerTarget * 1000) / 1000 : null,
    nonNullAirYardsShare: nonNullShare,
    maxWeeks,
  });
}

console.log(JSON.stringify(rows, null, 2));
