#!/usr/bin/env node
/**
 * bin/purge-cdn.mjs — jsDelivr purge + verify CLI.
 *
 *   node bin/purge-cdn.mjs [--repo owner/name] <path> [<path> …]
 *
 * Purges each repo-relative path (family files first, manifest.json always last), verifies the
 * CDN serves the pushed bytes, re-purging on a back-off. No paths = manifest only. Repo comes
 * from --repo, else GITHUB_REPOSITORY. Exit 0 if every path verified, 1 if not, 2 on a usage error, an
 * invalid path, or a local read failure (all before any network call).
 *
 * Local use:
 *   GITHUB_REPOSITORY=antonwilms/sleeper-dashboard-data node bin/purge-cdn.mjs <paths>
 */

import { purgeAndVerify } from '../scripts/purge-cdn.mjs';

const USAGE = 'usage: node bin/purge-cdn.mjs [--repo owner/name] <path> [<path> …]';

let repo = process.env.GITHUB_REPOSITORY;
const paths = [];
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === '--help' || a === '-h') {
    console.log(USAGE);
    console.log('  Repo defaults to $GITHUB_REPOSITORY. manifest.json is always purged last.');
    process.exit(0);
  } else if (a === '--repo') {
    repo = argv[++i];
  } else if (a.startsWith('--')) {
    console.error(`unknown flag: ${a}\n${USAGE}`);
    process.exit(2);
  } else {
    paths.push(a);
  }
}

if (!repo || !/^[^/\s]+\/[^/\s]+$/.test(repo)) {
  console.error(`repo missing or not owner/name (set --repo or GITHUB_REPOSITORY)\n${USAGE}`);
  process.exit(2);
}

let result;
try {
  result = await purgeAndVerify({ repo, paths });
} catch (err) {
  console.error(`::error::cdn-purge: ${err.message}`);
  process.exit(2);
}

const live = result.results.filter((r) => !r.skipped);
const bad = live.filter((r) => !r.verified);
if (result.ok) {
  console.log(`cdn-purge: ${live.length}/${live.length} verified`);
  process.exit(0);
}
console.log(`cdn-purge: FAILED ${bad.map((r) => r.path).join(' ')}`);
process.exit(1);
