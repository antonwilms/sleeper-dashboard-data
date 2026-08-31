#!/usr/bin/env node
/**
 * scripts/advstats-verify-season-type.mjs — advstats-grain-and-share.md §4 step 6.
 *
 * The REG-only filter's throw guards a missing COLUMN, not an unexpected VALUE. This
 * fetches all 14 source CSVs (2012-2025) from the stats_player release and asserts the
 * season_type value set is exactly {REG, POST} for each — a different spelling in an
 * older season would silently drop every row and exit quietly through the sparsity gate.
 * Read-only; no writes.
 */
import { fetchPlayerStatsCsv, splitCsvLine } from '../lib/nflverse.mjs';

const YEARS = Array.from({ length: 2025 - 2012 + 1 }, (_, i) => 2012 + i);

let anyBad = false;
for (const year of YEARS) {
  const csv = await fetchPlayerStatsCsv(year);
  if (!csv) {
    console.log(`${year}: FETCH FAILED (404/504) — cannot verify`);
    anyBad = true;
    continue;
  }
  const lines = csv.replace(/\r\n/g, '\n').split('\n').filter(l => l.trim());
  const header = splitCsvLine(lines[0]);
  const iType = header.indexOf('season_type');
  if (iType === -1) {
    console.log(`${year}: season_type COLUMN ABSENT`);
    anyBad = true;
    continue;
  }
  const values = new Set();
  const counts = {};
  for (let i = 1; i < lines.length; i++) {
    const fields = splitCsvLine(lines[i]);
    const v = fields[iType]?.trim();
    values.add(v);
    counts[v] = (counts[v] || 0) + 1;
  }
  const unexpected = [...values].filter(v => v !== 'REG' && v !== 'POST');
  const status = unexpected.length ? `UNEXPECTED VALUES: ${JSON.stringify(unexpected)}` : 'OK';
  if (unexpected.length) anyBad = true;
  console.log(`${year}: values=${JSON.stringify([...values])} counts=${JSON.stringify(counts)} — ${status}`);
}

console.log(anyBad ? '\nFAILED — see above' : '\nAll 14 seasons: season_type ∈ {REG, POST} exactly, verified.');
process.exit(anyBad ? 1 : 0);
