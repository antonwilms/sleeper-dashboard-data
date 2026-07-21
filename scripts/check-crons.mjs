/**
 * scripts/check-crons.mjs — Cron dead-man detector logic.
 *
 * The expected-job set IS the workflow files: every `.github/workflows/*.yml`
 * with a `cron:` line is auto-discovered and cross-checked against the
 * Actions API for run evidence. There is no second registry to forget to
 * update — a new scheduled workflow is covered the moment it lands on main.
 *
 * Monitoring only: writes no data file, touches no manifest, serves nothing.
 */

import fs from 'fs';
import { repoPath, listDir, appendStepSummary } from '../lib/io.mjs';

// The detector's own workflow. It deliberately exits non-zero (a "failure"
// conclusion) whenever it surfaces a real downstream finding — that IS
// working correctly, not a health problem. It is exempted from the
// conclusion/health check (only) so a real finding doesn't self-report as
// redundant noise; registered/enabled/recent are still checked for it, so a
// genuinely disabled or never-running detector is still caught. See the
// README §GitHub Actions limitation paragraph.
export const SELF_WORKFLOW_FILE = 'cron-deadman.yml';

const OK_STATUSES = new Set(['ok', 'ok-bootstrap']);

const CRON_LINE_RE = /^\s*-\s*cron:\s*(.+?)\s*$/gm;
const CRON_FIELD_RE = /^[\d*/,-]+$/;

/**
 * Parses one workflow YAML text for cron expressions, quoted or unquoted.
 * A `cron:` line is never silently dropped — even a value that will later
 * fail to parse as a cron expression is extracted verbatim so it surfaces as
 * a loud finding instead of vanishing from the expected-job set. Pure.
 *
 * @param {string} yamlText
 * @returns {string[]}
 */
export function extractCrons(yamlText) {
  const crons = [];
  let match;
  while ((match = CRON_LINE_RE.exec(yamlText)) !== null) {
    let value = match[1];
    const quoted = /^(['"])([\s\S]*)\1$/.exec(value);
    if (quoted) {
      value = quoted[2];
    } else {
      const commentIdx = value.indexOf(' #');
      if (commentIdx !== -1) value = value.slice(0, commentIdx).trimEnd();
    }
    crons.push(value);
  }
  return crons;
}

/**
 * Lists scheduled workflows from a workflows dir (default '.github/workflows').
 * Reads each *.yml / *.yaml; keeps those with >=1 cron.
 *
 * @param {string} [dir]
 * @returns {{ file: string, path: string, crons: string[] }[]}
 */
export function listScheduledWorkflows(dir = '.github/workflows') {
  const files = listDir(dir).filter((f) => /\.ya?ml$/.test(f));
  const scheduled = [];
  for (const file of files) {
    const text = fs.readFileSync(repoPath(dir, file), 'utf8');
    const crons = extractCrons(text);
    if (crons.length > 0) {
      scheduled.push({ file, path: `${dir}/${file}`, crons });
    }
  }
  return scheduled;
}

/**
 * Classifies a 5-field cron per the cadence table. Throws on malformed input
 * (wrong field count, or a field with characters that aren't valid cron
 * syntax) — callers must catch and turn that into a finding, never let it
 * silently disappear. Pure.
 *
 * @param {string} cronExpr
 * @returns {{ kind: 'weekly'|'yearly'|'monthly'|'daily', maxAgeDays: number }}
 */
export function cronCadence(cronExpr) {
  const fields = String(cronExpr).trim().split(/\s+/);
  if (fields.length !== 5 || fields.some((f) => !CRON_FIELD_RE.test(f))) {
    throw new Error(`Malformed cron expression: "${cronExpr}"`);
  }
  const [, , dayOfMonth, month, dayOfWeek] = fields;
  if (dayOfWeek !== '*') return { kind: 'weekly', maxAgeDays: 8 };
  if (dayOfMonth !== '*' && month !== '*') return { kind: 'yearly', maxAgeDays: 368 };
  if (dayOfMonth !== '*') return { kind: 'monthly', maxAgeDays: 33 };
  return { kind: 'daily', maxAgeDays: 2 };
}

/**
 * Evaluates one workflow against API evidence. Pure — `now` injected.
 *
 * @param {object} opts
 * @param {{ file: string, path: string, crons: string[] }} opts.local
 * @param {object|null} opts.apiWorkflow
 * @param {object|null} opts.latestRun
 * @param {Date} opts.now
 * @returns {{ status: string, detail: string, maxAgeDays: number|null }}
 */
export function evaluateWorkflow({ local, apiWorkflow, latestRun, now }) {
  if (!apiWorkflow) {
    return {
      status: 'unregistered',
      detail: `No Actions API workflow matches path "${local.path}"`,
      maxAgeDays: null,
    };
  }
  if (apiWorkflow.state !== 'active') {
    return {
      status: 'disabled',
      detail: `Workflow state is "${apiWorkflow.state}" (expected "active")`,
      maxAgeDays: null,
    };
  }

  let maxAgeDays;
  try {
    maxAgeDays = Math.min(...local.crons.map((c) => cronCadence(c).maxAgeDays));
  } catch (err) {
    return { status: 'malformed-cron', detail: err.message, maxAgeDays: null };
  }
  const maxAgeMs = maxAgeDays * 24 * 60 * 60 * 1000;

  if (!latestRun) {
    const createdAgeMs = now - new Date(apiWorkflow.created_at);
    if (createdAgeMs <= maxAgeMs) {
      return {
        status: 'ok-bootstrap',
        detail: 'No runs yet; workflow registered within the bootstrap grace window',
        maxAgeDays,
      };
    }
    return {
      status: 'missing-run',
      detail: 'No runs ever recorded and the bootstrap grace window has passed',
      maxAgeDays,
    };
  }

  const runAgeMs = now - new Date(latestRun.created_at);
  if (runAgeMs > maxAgeMs) {
    return {
      status: 'stale',
      detail: `Latest run is ${Math.floor(runAgeMs / 86400000)}d old (max ${maxAgeDays}d)`,
      maxAgeDays,
    };
  }

  if (local.file === SELF_WORKFLOW_FILE) {
    return {
      status: 'ok',
      detail: 'Self-workflow: conclusion check skipped by design (see README limitation)',
      maxAgeDays,
    };
  }

  if (latestRun.conclusion !== 'success' && latestRun.conclusion !== null) {
    return {
      status: 'failed',
      detail: `Latest run conclusion is "${latestRun.conclusion}"`,
      maxAgeDays,
    };
  }

  return { status: 'ok', detail: 'Healthy', maxAgeDays };
}

function cadenceLabel(crons) {
  try {
    return [...new Set(crons.map((c) => cronCadence(c).kind))].join('+');
  } catch {
    return 'malformed';
  }
}

/**
 * Orchestrator. fetchImpl injected for tests. ~1 + N API calls (N = scheduled
 * workflow count):
 *   GET /repos/{repo}/actions/workflows?per_page=100          (match by .path)
 *   GET /repos/{repo}/actions/workflows/{id}/runs?per_page=1  (latest run, any event)
 * Auth: Bearer ${token}; Accept: application/vnd.github+json.
 *
 * @param {object} opts
 * @param {string} opts.repoFullName
 * @param {string} opts.token
 * @param {Date} [opts.now]
 * @param {typeof fetch} [opts.fetchImpl]
 * @returns {Promise<{ results: object[], failures: object[] }>}
 */
export async function runDeadman({ repoFullName, token, now = new Date(), fetchImpl = fetch }) {
  const local = listScheduledWorkflows();
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
  };

  const workflowsRes = await fetchImpl(
    `https://api.github.com/repos/${repoFullName}/actions/workflows?per_page=100`,
    { headers }
  );
  const workflowsJson = await workflowsRes.json();
  const apiWorkflows = workflowsJson.workflows ?? [];

  const results = [];
  for (const wf of local) {
    const apiWorkflow = apiWorkflows.find((w) => w.path === wf.path) ?? null;
    let latestRun = null;
    if (apiWorkflow) {
      const runsRes = await fetchImpl(
        `https://api.github.com/repos/${repoFullName}/actions/workflows/${apiWorkflow.id}/runs?per_page=1`,
        { headers }
      );
      const runsJson = await runsRes.json();
      latestRun = (runsJson.workflow_runs ?? [])[0] ?? null;
    }
    const evaluation = evaluateWorkflow({ local: wf, apiWorkflow, latestRun, now });
    results.push({ file: wf.file, path: wf.path, crons: wf.crons, latestRun, ...evaluation });
  }

  const failures = results.filter((r) => !OK_STATUSES.has(r.status));

  const header = '| Workflow | Cadence | Last run | Conclusion | Status |\n|---|---|---|---|---|';
  const bodyRows = results.map((r) => {
    const cadence = cadenceLabel(r.crons);
    const lastRun = r.latestRun?.created_at ?? '—';
    const conclusion = r.latestRun ? (r.latestRun.conclusion ?? 'in progress') : '—';
    return `| ${r.file} | ${cadence} | ${lastRun} | ${conclusion} | ${r.status} |`;
  });
  const table = [header, ...bodyRows].join('\n');

  console.log(table);
  for (const f of failures) {
    console.log(`::error::${f.file}: ${f.status} — ${f.detail}`);
  }
  appendStepSummary(`## Cron dead-man check\n\n${table}\n`);

  return { results, failures };
}
