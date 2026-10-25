/**
 * scripts/fixtures/build-rookie-golden-pre-b.mjs — captures the PRE-EDIT outputs of runRookiePanels / runRookieTotal on the
 * test-support memLoad fixtures, so P3 Slice B's adapter parameters (`entryToYear`, `evaluateTargetSeason`) can be proven
 * byte-identical at their defaults (.claude/tasks/january-grading-run-b.md §11, Flag 4). Run ONCE, before either adapter is
 * edited; the committed golden must predate every adapter edit.
 *
 * Run: node scripts/fixtures/build-rookie-golden-pre-b.mjs
 *
 * Output: test/fixtures/season-grade/rookie-golden-pre-b.json, `meta.generatedAt` stripped, JSON-normalised.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { runRookiePanels } from '../panel-run.mjs';
import { runRookieTotal } from '../rookie-total-run.mjs';
import { memLoad, leagueStub, row } from '../../test-support/rookie-basis-fixtures.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const OUT = path.join(ROOT, 'test/fixtures/season-grade/rookie-golden-pre-b.json');

const strip = (result) => {
  const o = JSON.parse(JSON.stringify(result));
  if (o.meta) delete o.meta.generatedAt;
  return o;
};

export function buildGolden() {
  return {
    panelsHalf: strip(runRookiePanels({ load: memLoad() })),
    panelsLeague: strip(runRookiePanels({ load: memLoad(), basis: 'league' })),
    rookieTotalLeague: strip(runRookieTotal({ load: leagueStub([row()]), basis: 'league', panelPath: 'p.json' })),
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  fs.writeFileSync(OUT, JSON.stringify(buildGolden(), null, 2) + '\n', 'utf8');
  console.log(`wrote ${path.relative(ROOT, OUT)}`);
}
