#!/usr/bin/env node
/**
 * scripts/fixtures/build-inseason-routing-parity.mjs — builds the LP-1b parity fixture (task
 * .claude/tasks/learned-projection-1b-weekly-bench.md §4.8). By hand, never by `npm test`/smoke/CI; needs Node ≥ 20.6 and the
 * sibling app checkout (absent → exit 1).
 *
 * It imports the REAL app modules (a resolve hook retries an extensionless relative specifier with `.js`), derives the chain
 * bases with the DATA functions (`preseasonChain`, `liveChainAt` via test-support/lp-scenario.mjs — this builder holds no rule of
 * its own; T-APP-2 proves those values against the app), runs the app's functions per checkpoint and writes
 * test/fixtures/learned-panel/inseason-routing-parity-<YYYY-MM-DD>.json (UTC build date, `--date YYYY-MM-DD` to override).
 * The same bytes are copied to the app's src/__fixtures__/ and pinned by SHA-256 in both repos' tests.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { register } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { SCENARIO, scenarioChains, scenarioToAppInputs, scenarioCareerStats } from '../../test-support/lp-scenario.mjs';
import { pinnedQbChainModels } from '../../lib/projectionFactors.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const dataRoot = path.resolve(here, '..', '..');
const appRoot = path.resolve(dataRoot, '..', 'sleeper-dashboard');
const APP_ANCHOR = '2c3578b';
const APP_FILES = ['inSeasonScoring', 'inSeasonConstants', 'qbTakeover', 'qbTakeoverConstants', 'fantasyPoints', 'seasonProjection'].map(f => `src/utils/${f}.js`);

if (!fs.existsSync(path.join(appRoot, 'src/utils/inSeasonScoring.js'))) {
  console.error(`[build-parity] the sibling app checkout is not at ${appRoot} — cannot build; say so and stop`);
  process.exit(1);
}
const git = (args) => execFileSync('git', ['-C', appRoot, ...args], { encoding: 'utf8' }).trim();
try { git(['diff', '--quiet', APP_ANCHOR, '--', ...APP_FILES]); git(['diff', '--quiet', '--', ...APP_FILES]); } catch {
  console.error(`[build-parity] an app source file differs from ${APP_ANCHOR} — report the diff and stop (task §11)`);
  process.exit(1);
}
const appRev = git(['rev-parse', 'HEAD']);

// the resolve hook: an extensionless relative specifier → retry with .js
register('data:text/javascript,' + encodeURIComponent(`
export async function resolve(specifier, context, next) {
  try { return await next(specifier, context); } catch (e) {
    if ((specifier.startsWith('./') || specifier.startsWith('../')) && !/\\.[a-z]+$/.test(specifier)) return next(specifier + '.js', context);
    throw e;
  }
}`), import.meta.url);

const appUrl = (f) => pathToFileURL(path.join(appRoot, 'src/utils', f)).href;
const { classifyInSeasonPopulation, posteriorOf, buildQbLiveStates, buildScoringPosteriors } = await import(appUrl('inSeasonScoring.js'));
const K = await import(appUrl('inSeasonConstants.js'));

const dateArg = process.argv.indexOf('--date');
const date = dateArg > 0 ? process.argv[dateArg + 1] : new Date().toISOString().slice(0, 10);
if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) { console.error('[build-parity] --date must be YYYY-MM-DD'); process.exit(2); }

const models = pinnedQbChainModels(JSON.parse(fs.readFileSync(path.join(dataRoot, 'backtests/2026-10-03-qb-takeover-constants.json'), 'utf8')));
const S = SCENARIO.season;
const ch = scenarioChains(SCENARIO, models);
const careerStats = scenarioCareerStats(SCENARIO);

const chain = { pre: ch.pre, pre16: ch.pre16, live: ch.live };
const qbPlayerMap = (entries) => Object.fromEntries(entries.map(([id, team, order]) => [id, {
  position: 'QB', team: team ?? null, depth_chart_order: order ?? null, years_exp: ch.draftYearOf(id) != null ? S - ch.draftYearOf(id) : null,
}]));
const preEntries = [...ch.preRoom].map(([id, v]) => [id, v.team, v.order]);
const chainInputs = {
  pre: { dataSeason: S - 1, games: 17, careerStats, playerMap: qbPlayerMap(preEntries) },
  pre16: { dataSeason: S - 1, games: 16, careerStats, playerMap: qbPlayerMap(preEntries) },
  live: Object.fromEntries(SCENARIO.checkpoints.map((w) => [w, {
    dataSeason: S - 1, games: 17, careerStats,
    playerMap: qbPlayerMap(SCENARIO.players.filter(p => p.pos === 'QB').map(p => [p.id, ch.ctxAt[w].get(p.id).T, ch.ctxAt[w].get(p.id).order])),
  }])),
};

const toPlain = (v) => JSON.parse(JSON.stringify(v, (k, x) => (x instanceof Map ? [...x] : x)));
const cases = [];
for (const w of SCENARIO.checkpoints) {
  const appInputs = scenarioToAppInputs(SCENARIO, w, chain, ch.ctxAt[w]);
  const live = buildQbLiveStates({ ...appInputs.qbLiveStatesArgs });
  const posteriors = buildScoringPosteriors({ ...appInputs.scoringArgs, qbLiveStates: live });
  const population = {};
  for (const [id, info] of Object.entries(appInputs.scoringArgs.playerMap)) {
    population[id] = classifyInSeasonPopulation({ playerId: id, careerStats, dataSeason: S - 1, yearsExp: info.years_exp ?? null });
  }
  const omitted = Object.keys(appInputs.scoringArgs.seasonProjections).filter(id => !posteriors.has(id));
  cases.push({
    w, appInputs: toPlain(appInputs),
    app: {
      population, liveStates: toPlain([...live]),
      posteriors: toPlain([...posteriors].map(([id, r]) => [id, { population: r.population, ros: { k: r.ros.k, value: r.ros.value }, ...(r.start ? { start: r.start } : {}) }])),
      omitted,
    },
  });
}

const kTables = { standard: K.K_ROS_POINTS, SHORT: K.K_ROS_POINTS_SHORT, ROOKIE0: K.K_ROS_POINTS_ROOKIE0, ROOKIE1P: K.K_ROS_POINTS_ROOKIE1P };
const postArgs = [
  [10, 12, 4, 3], [10, 12, 0, 3], [10, null, 0, 3], [10, null, 2, 3], [null, 12, 2, 3], [null, null, 0, 3], [8.5, 11.25, 7, 2.5],
  [8.5, 11.25, 7, 0], [8.5, 11.25, -1, 3], [8.5, 11.25, 2.5, 3], [8.5, 11.25, 3, -1], [8.5, 11.25, 3, null], [0, 0, 5, 1.5],
];
const posteriorCases = postArgs.map(args => ({ args, value: posteriorOf(...args)?.value ?? null }));

const out = {
  appRev,
  builtWith: { script: 'scripts/fixtures/build-inseason-routing-parity.mjs', qbTakeoverConstants: 'backtests/2026-10-03-qb-takeover-constants.json', appFiles: APP_FILES },
  scenario: SCENARIO, chain, chainInputs, cases, kTables, posteriorOf: posteriorCases,
};
const target = path.join(dataRoot, 'test/fixtures/learned-panel', `inseason-routing-parity-${date}.json`);
fs.writeFileSync(target, JSON.stringify(out, null, 1) + '\n');
console.log(`[build-parity] wrote ${path.relative(dataRoot, target)} (app rev ${appRev})`);
