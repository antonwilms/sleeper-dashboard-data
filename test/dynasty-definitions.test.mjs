/**
 * Pins lib/dynastyBacktest.mjs CR-33 definitions to the fixture table shared with the app's
 * src/__tests__/twoYearBaselineParity.test.js. Change a row only together with that file and the index entry.
 * (The app's copy: src/utils/twoYearBaseline.js `twoYearAveragePPG`, `cautionAge`, `ageCaution`.)
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { twoYearAveragePPG, ageAsOfDate, cohortAge, ageBand, AGE_BANDS } from '../lib/dynastyBacktest.mjs';
import { level2Of, ageBand as reworkAgeBand } from '../lib/dynastyRework.mjs';
import { AGE_BANDS as historyBands } from '../scripts/dynasty-history-run.mjs';
import { AGE_BANDS as reworkBands } from '../scripts/dynasty-rework-run.mjs';

const S = 2024;
const g = (gp, fp) => ({ gamesPlayed: gp, fantasyPoints: fp });
// careerStats seasons 2022–2024; undefined = no row that season.
const B2_CASES = [
  { id: 'both', y2022: undefined, y2023: g(16, 160), y2024: g(16, 192), B2: 11 },
  { id: 'eight-in-prior', y2022: undefined, y2023: g(8, 96), y2024: g(16, 160), B2: 11 },
  { id: 'seven-in-prior', y2022: undefined, y2023: g(7, 140), y2024: g(16, 160), B2: 10 },
  { id: 'seven-in-current', y2022: undefined, y2023: g(16, 160), y2024: g(7, 140), B2: 10 },
  { id: 'prior-missing', y2022: undefined, y2023: undefined, y2024: g(16, 192), B2: 12 },
  { id: 'current-missing', y2022: undefined, y2023: g(16, 192), y2024: undefined, B2: 12 },
  { id: 'neither', y2022: undefined, y2023: g(7, 70), y2024: g(7, 70), B2: null },
  { id: 'older-ignored', y2022: g(16, 320), y2023: g(16, 160), y2024: g(16, 160), B2: 10 },
  { id: 'nonfinite-prior', y2022: undefined, y2023: g(16, null), y2024: g(16, 160), B2: 10 },
];
const AGE_CASES = [
  { birthdate: '2001-06-01', age: 24, caution: 'low' },
  { birthdate: '2000-06-02', age: 24, caution: 'low' },
  { birthdate: '2000-06-01', age: 25, caution: 'none' },
  { birthdate: '2000-05-31', age: 25, caution: 'none' },
  { birthdate: '1994-06-02', age: 30, caution: 'none' },
  { birthdate: '1994-06-01', age: 31, caution: 'high' },
];
const careerFor = (c) => {
  const cs = {};
  for (const [y, v] of [[2022, c.y2022], [2023, c.y2023], [2024, c.y2024]]) if (v) cs[y] = { [c.id]: v };
  return cs;
};

describe('CR-33 data definitions', () => {
  test('twoYearAveragePPG equals the shared B2 column', () => {
    for (const c of B2_CASES) assert.equal(twoYearAveragePPG(careerFor(c), c.id, S), c.B2, c.id);
  });
  test('ageAsOfDate / cohortAge equal the shared age column', () => {
    assert.equal(ageAsOfDate(S), '2025-06-01');
    for (const c of AGE_CASES) assert.equal(cohortAge(c.birthdate, S), c.age, c.birthdate);
    assert.equal(cohortAge(null, S), null);
  });
  test('ageBand maps the shared age column to the shared caution column', () => {
    for (const c of AGE_CASES) {
      const b = ageBand(c.age);
      const caution = b === 'le24' ? 'low' : b === 'ge31' ? 'high' : 'none';
      assert.equal(caution, c.caution, c.birthdate);
    }
    assert.equal(ageBand(25), '25-27');
    assert.equal(ageBand(28), '28-30');
    assert.equal(ageBand(null), null);
    assert.deepEqual(AGE_BANDS, ['le24', '25-27', '28-30', 'ge31']);
  });
  test('single-site identity: S4a and both scripts export the lib definitions, not copies', () => {
    assert.equal(level2Of, twoYearAveragePPG);
    assert.equal(reworkAgeBand, ageBand);
    assert.equal(historyBands, AGE_BANDS);
    assert.equal(reworkBands, AGE_BANDS);
  });
});
