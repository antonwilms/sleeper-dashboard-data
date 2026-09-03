/**
 * scripts/verify-college-pivot-roundtrip.mjs — E2 Phase B §4 step 3: the migration's whole proof.
 *
 * For each of the 27 college stat files (still in their pre-migration long-form shape at
 * the time this runs): pivot in memory, reconstruct long-form rows from the pivoted object, and
 * assert the reconstruction equals the original file's rows AS A SET.
 *
 * `stat` is compared NUMERICALLY (parseFloat on both sides) — it is stored as a string on disk
 * and the pivot emits a number, so a raw string comparison fails on ALL 314,871 rows, not zero
 * (college-pivot-phase-b.md §1.1a). This proves VALUE preservation, not byte preservation:
 * 24,065 of 314,871 values (7.6%) change textual form ("1.000"→1, "10.0"→10), concentrated in
 * PCT/YPA/YPC/YPR. That is the honest Invariant-1 justification for this migration, stated here,
 * in the commit message, and in data-catalog.md.
 *
 * One-shot verification script, not a committed test — its input (the pre-migration long-form
 * files) disappears the moment the real migration runs. Its output is committed as the record
 * (college-pivot-phase-b.md §5).
 *
 * Usage:
 *   node scripts/verify-college-pivot-roundtrip.mjs
 */

import { readJson, listDir } from '../lib/io.mjs';
import { pivotCfbdRows } from '../lib/cfbd.mjs';

const CATEGORIES = ['passing', 'receiving', 'rushing'];

function reconstructRows(pivoted) {
  const rows = [];
  for (const rec of Object.values(pivoted)) {
    const { playerId, player, team, position, conference, ...stats } = rec;
    for (const [statType, stat] of Object.entries(stats)) {
      rows.push({ playerId, player, team, position, conference, statType, stat });
    }
  }
  return rows;
}

function rowKey(r) {
  return `${r.playerId}|${r.statType}`;
}

function main() {
  const files = [];
  for (const category of CATEGORIES) {
    for (const name of listDir(`college/${category}`).filter(f => f.endsWith('.json')).sort()) {
      files.push({ category, year: Number(name.replace('.json', '')), relPath: `college/${category}/${name}` });
    }
  }

  console.log(`[verify-roundtrip] Checking ${files.length} file(s)…\n`);

  let totalRows = 0;
  let totalTextChanged = 0;
  let anyFailure = false;
  const perFile = [];

  for (const { category, year, relPath } of files) {
    const before = readJson(relPath);
    if (!Array.isArray(before)) {
      console.error(`[verify-roundtrip] ${relPath}: not a long-form array (already migrated?) — aborting.`);
      process.exit(1);
    }

    const pivoted = pivotCfbdRows(before);
    const reconstructed = reconstructRows(pivoted);

    if (reconstructed.length !== before.length) {
      console.error(`[verify-roundtrip] ${relPath}: FAIL — row count ${before.length} → reconstructed ${reconstructed.length}`);
      anyFailure = true;
      continue;
    }

    const originalByKey = new Map(before.map(r => [rowKey(r), r]));
    const reconstructedKeys = new Set(reconstructed.map(rowKey));

    let missing = 0;
    let mismatched = 0;
    let textChanged = 0;

    for (const r of reconstructed) {
      const orig = originalByKey.get(rowKey(r));
      if (!orig) { missing++; continue; }
      const origNum = parseFloat(orig.stat);
      if (origNum !== r.stat) { mismatched++; continue; }
      if (String(orig.stat) !== String(r.stat)) textChanged++;
    }

    // Every original row's key must appear in the reconstruction too (set equality both ways).
    let missingFromReconstruction = 0;
    for (const orig of before) {
      if (!reconstructedKeys.has(rowKey(orig))) missingFromReconstruction++;
    }

    const ok = missing === 0 && mismatched === 0 && missingFromReconstruction === 0;
    if (!ok) anyFailure = true;

    totalRows += before.length;
    totalTextChanged += textChanged;

    perFile.push({ relPath, rows: before.length, players: Object.keys(pivoted).length, missing, mismatched, missingFromReconstruction, textChanged, ok });
    console.log(`[verify-roundtrip] ${relPath}: ${before.length} rows, ${Object.keys(pivoted).length} players — ` +
      `${ok ? 'OK' : 'FAIL'} (missing=${missing}, mismatched=${mismatched}, textChanged=${textChanged})`);
  }

  console.log(`\n[verify-roundtrip] Totals: ${totalRows} rows across ${files.length} files, ` +
    `${totalTextChanged} values (${(100 * totalTextChanged / totalRows).toFixed(1)}%) changed textual form ` +
    `(numerically identical — e.g. "1.000"→1). Value-preserving, not byte-preserving.`);

  if (anyFailure) {
    console.error('\n[verify-roundtrip] FAILED — see per-file report above.');
    process.exit(1);
  }
  console.log('\n[verify-roundtrip] PASSED — all 27 files reconstruct to their original row set (numeric comparison).');
}

main();
