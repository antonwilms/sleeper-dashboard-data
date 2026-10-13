#!/usr/bin/env node
/**
 * bin/deadman.mjs — Cron dead-man detector CLI.
 *
 * Checks every scheduled workflow in .github/workflows/*.yml against Actions
 * API run evidence and reports missed/failed/disabled captures. A finding on a
 * capture-only workflow (CAPTURE_ONLY_WORKFLOWS) also opens a GitHub issue — locally
 * too, since the token is real.
 *
 * Local use:
 *   GITHUB_REPOSITORY=antonwilms/sleeper-dashboard-data GITHUB_TOKEN=$(gh auth token) node bin/deadman.mjs
 *
 * No flags.
 */

import { runDeadman, fileCaptureIssues } from '../scripts/check-crons.mjs';

const repoFullName = process.env.GITHUB_REPOSITORY;
const token = process.env.GITHUB_TOKEN;

if (!repoFullName || !token) {
  console.error('GITHUB_REPOSITORY and GITHUB_TOKEN must both be set.');
  console.error(
    'Local use: GITHUB_REPOSITORY=owner/repo GITHUB_TOKEN=$(gh auth token) node bin/deadman.mjs'
  );
  process.exit(1);
}

const { failures } = await runDeadman({ repoFullName, token });
await fileCaptureIssues({ failures, repoFullName, token });
process.exit(failures.length ? 1 : 0);
