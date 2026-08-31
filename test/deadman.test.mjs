/**
 * test/deadman.test.mjs — Unit tests for the cron dead-man detector
 * (extractCrons / listScheduledWorkflows / cronCadence / evaluateWorkflow /
 * runDeadman). No network — fetchImpl / now are injected.
 *
 * Run with: node --test  (or npm test)
 */

import { test } from 'node:test';
import assert   from 'node:assert/strict';
import fs       from 'node:fs';
import os       from 'node:os';
import path     from 'node:path';

import {
  extractCrons,
  listScheduledWorkflows,
  cronCadence,
  evaluateWorkflow,
  runDeadman,
  SELF_WORKFLOW_FILE,
} from '../scripts/check-crons.mjs';

// ─── extractCrons ────────────────────────────────────────────────────────────

test('extractCrons: quoted single cron (weekly-ktc.yml-style)', () => {
  const yaml = `
on:
  schedule:
    - cron: "17 13 * * 1"
  workflow_dispatch: {}
`;
  assert.deepEqual(extractCrons(yaml), ['17 13 * * 1']);
});

test('extractCrons: multiple quoted crons in one workflow', () => {
  const yaml = `
on:
  schedule:
    - cron: "17 13 * * 1"
    - cron: '19 5 * * *'
`;
  assert.deepEqual(extractCrons(yaml), ['17 13 * * 1', '19 5 * * *']);
});

test('extractCrons: no cron (smoke-test.yml-style, pull_request only)', () => {
  const yaml = `
on:
  pull_request:
    paths:
      - "bin/**"
`;
  assert.deepEqual(extractCrons(yaml), []);
});

test('extractCrons: unquoted cron line is captured, not dropped', () => {
  const yaml = `
on:
  schedule:
    - cron: 19 5 * * *
  workflow_dispatch: {}
`;
  assert.deepEqual(extractCrons(yaml), ['19 5 * * *']);
});

test('extractCrons: unparseable cron value is still extracted verbatim (never silently dropped)', () => {
  const yaml = `
on:
  schedule:
    - cron: not-a-cron
`;
  assert.deepEqual(extractCrons(yaml), ['not-a-cron']);
});

// ─── cronCadence ─────────────────────────────────────────────────────────────

test('cronCadence: real cron strings from the current workflow set classify correctly', () => {
  const cases = [
    ['0 12 1 5 *', 'yearly', 368],   // nflverse-draft.yml
    ['29 13 * * 3', 'weekly', 8],    // nflverse-playerids.yml
    ['47 13 * * 6', 'weekly', 8],    // nflverse-playerstats.yml (advstats + gamelogs, single-fetch)
    ['35 13 * * 5', 'weekly', 8],    // nflverse-schedule.yml
    ['53 13 * * 0', 'weekly', 8],    // nflverse-teamcontext.yml
    ['23 13 * * 2', 'weekly', 8],    // weekly-nflverse-roster.yml
    ['11 14 * * 6', 'weekly', 8],    // weekly-playerstate.yml
    ['17 13 * * 1', 'weekly', 8],    // weekly-ktc.yml
  ];
  let weeklyCount = 0;
  let yearlyCount = 0;
  for (const [expr, kind, maxAgeDays] of cases) {
    const result = cronCadence(expr);
    assert.equal(result.kind, kind, expr);
    assert.equal(result.maxAgeDays, maxAgeDays, expr);
    if (kind === 'weekly') weeklyCount++;
    if (kind === 'yearly') yearlyCount++;
  }
  assert.equal(weeklyCount, 7);
  assert.equal(yearlyCount, 1);
});

test('cronCadence: daily and monthly', () => {
  assert.deepEqual(cronCadence('19 5 * * *'), { kind: 'daily', maxAgeDays: 2 });
  assert.deepEqual(cronCadence('0 3 15 * *'), { kind: 'monthly', maxAgeDays: 33 });
});

test('cronCadence: malformed input throws', () => {
  assert.throws(() => cronCadence('not a cron'));
  assert.throws(() => cronCadence('0 3 15 *'));
});

// ─── evaluateWorkflow ────────────────────────────────────────────────────────

const now = new Date('2026-07-19T00:00:00Z');
const daysAgo = (n) => new Date(now.getTime() - n * 24 * 60 * 60 * 1000).toISOString();

function local(overrides = {}) {
  return { file: 'weekly-ktc.yml', path: '.github/workflows/weekly-ktc.yml', crons: ['17 13 * * 1'], ...overrides };
}

test('evaluateWorkflow: ok (run 2 days old, success, weekly)', () => {
  const r = evaluateWorkflow({
    local: local(),
    apiWorkflow: { state: 'active', created_at: daysAgo(400) },
    latestRun: { created_at: daysAgo(2), conclusion: 'success' },
    now,
  });
  assert.equal(r.status, 'ok');
});

test('evaluateWorkflow: stale (run 9 days old, success, weekly)', () => {
  const r = evaluateWorkflow({
    local: local(),
    apiWorkflow: { state: 'active', created_at: daysAgo(400) },
    latestRun: { created_at: daysAgo(9), conclusion: 'success' },
    now,
  });
  assert.equal(r.status, 'stale');
});

test('evaluateWorkflow: failed (run 1 day old, conclusion failure)', () => {
  const r = evaluateWorkflow({
    local: local(),
    apiWorkflow: { state: 'active', created_at: daysAgo(400) },
    latestRun: { created_at: daysAgo(1), conclusion: 'failure' },
    now,
  });
  assert.equal(r.status, 'failed');
});

test('evaluateWorkflow: in-progress (latest run conclusion null)', () => {
  const r = evaluateWorkflow({
    local: local(),
    apiWorkflow: { state: 'active', created_at: daysAgo(400) },
    latestRun: { created_at: daysAgo(1), conclusion: null },
    now,
  });
  assert.equal(r.status, 'ok');
});

test('evaluateWorkflow: disabled (API state disabled_inactivity)', () => {
  const r = evaluateWorkflow({
    local: local(),
    apiWorkflow: { state: 'disabled_inactivity', created_at: daysAgo(400) },
    latestRun: { created_at: daysAgo(1), conclusion: 'success' },
    now,
  });
  assert.equal(r.status, 'disabled');
});

test('evaluateWorkflow: unregistered (no matching API workflow)', () => {
  const r = evaluateWorkflow({ local: local(), apiWorkflow: null, latestRun: null, now });
  assert.equal(r.status, 'unregistered');
});

test('evaluateWorkflow: bootstrap (no runs, API created_at 1 day ago, weekly)', () => {
  const r = evaluateWorkflow({
    local: local(),
    apiWorkflow: { state: 'active', created_at: daysAgo(1) },
    latestRun: null,
    now,
  });
  assert.equal(r.status, 'ok-bootstrap');
});

test('evaluateWorkflow: never-ran (no runs, API created_at 30 days ago, weekly)', () => {
  const r = evaluateWorkflow({
    local: local(),
    apiWorkflow: { state: 'active', created_at: daysAgo(30) },
    latestRun: null,
    now,
  });
  assert.equal(r.status, 'missing-run');
});

test('evaluateWorkflow: malformed-cron surfaces as a loud finding, not a crash', () => {
  const r = evaluateWorkflow({
    local: local({ crons: ['not-a-cron'] }),
    apiWorkflow: { state: 'active', created_at: daysAgo(400) },
    latestRun: { created_at: daysAgo(1), conclusion: 'success' },
    now,
  });
  assert.equal(r.status, 'malformed-cron');
  assert.match(r.detail, /not-a-cron/);
});

test('evaluateWorkflow: self-workflow exemption — failure conclusion on cron-deadman.yml is not a "failed" status', () => {
  const r = evaluateWorkflow({
    local: local({ file: SELF_WORKFLOW_FILE, path: `.github/workflows/${SELF_WORKFLOW_FILE}`, crons: ['19 5 * * *'] }),
    apiWorkflow: { state: 'active', created_at: daysAgo(400) },
    latestRun: { created_at: daysAgo(1), conclusion: 'failure' },
    now,
  });
  assert.equal(r.status, 'ok');
});

test('evaluateWorkflow: self-workflow is still caught if genuinely stale', () => {
  const r = evaluateWorkflow({
    local: local({ file: SELF_WORKFLOW_FILE, path: `.github/workflows/${SELF_WORKFLOW_FILE}`, crons: ['19 5 * * *'] }),
    apiWorkflow: { state: 'active', created_at: daysAgo(400) },
    latestRun: { created_at: daysAgo(5), conclusion: 'failure' },
    now,
  });
  assert.equal(r.status, 'stale');
});

// ─── listScheduledWorkflows (self-coverage) ─────────────────────────────────

test('self-coverage: listScheduledWorkflows finds the detector itself + >=9 others in the real repo dir', () => {
  const scheduled = listScheduledWorkflows('.github/workflows');
  const files = scheduled.map((s) => s.file);
  assert.ok(files.includes(SELF_WORKFLOW_FILE), 'expected cron-deadman.yml to be self-discovered');
  assert.ok(scheduled.length >= 9, `expected >=9 scheduled workflows, got ${scheduled.length}`);
});

// ─── runDeadman (end-to-end, injected fetch) ────────────────────────────────

test('runDeadman: end-to-end over the real workflow set, one designated stale', async (t) => {
  const local = listScheduledWorkflows();
  const staleFile = 'weekly-ktc.yml';
  assert.ok(local.some((w) => w.file === staleFile));

  const fetchImpl = async (url) => {
    if (url.includes('/actions/workflows?')) {
      const workflows = local.map((wf, i) => ({
        id: i + 1,
        path: wf.path,
        state: 'active',
        created_at: daysAgo(500),
      }));
      return { json: async () => ({ workflows }) };
    }
    const match = /\/actions\/workflows\/(\d+)\/runs/.exec(url);
    const wf = local[Number(match[1]) - 1];
    const createdAt = wf.file === staleFile ? daysAgo(20) : daysAgo(1);
    return { json: async () => ({ workflow_runs: [{ created_at: createdAt, conclusion: 'success' }] }) };
  };

  const summaryPath = path.join(os.tmpdir(), `deadman-summary-${process.pid}.md`);
  fs.writeFileSync(summaryPath, '');
  process.env.GITHUB_STEP_SUMMARY = summaryPath;
  t.after(() => {
    delete process.env.GITHUB_STEP_SUMMARY;
    fs.rmSync(summaryPath, { force: true });
  });

  const { results, failures } = await runDeadman({
    repoFullName: 'antonwilms/sleeper-dashboard-data',
    token: 'test-token',
    now,
    fetchImpl,
  });

  assert.equal(results.length, local.length);
  assert.equal(failures.length, 1);
  assert.equal(failures[0].file, staleFile);

  const summary = fs.readFileSync(summaryPath, 'utf8');
  assert.match(summary, new RegExp(staleFile));
  assert.match(summary, /cron-deadman\.yml/);
});
