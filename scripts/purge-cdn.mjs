/**
 * scripts/purge-cdn.mjs — jsDelivr purge + verify.
 *
 * Purges `@main/<path>` for each path, then checks the CDN now serves what was pushed,
 * re-purging on a back-off until it does. Family paths run first (Phase A), manifest.json
 * last (Phase B), then one unconditional re-purge sweep. See .claude/tasks/cdn-purge-verify.md.
 *
 * `DEFAULT_DEPS` is the injectable I/O seam (same pattern as scripts/update-nfl.mjs).
 */

import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import { repoPath } from '../lib/io.mjs';
import { readManifest } from '../lib/manifest.mjs';

export const PURGE_ATTEMPTS = 5;
export const VERIFY_DELAYS_MS = [15_000, 30_000, 60_000, 90_000, 120_000];
export const FETCH_TIMEOUT_MS = 60_000;
export const purgeUrl = (repo, path) => `https://purge.jsdelivr.net/gh/${repo}@main/${path}`;
export const cdnUrl = (repo, path) => `https://cdn.jsdelivr.net/gh/${repo}@main/${path}`;
export const purgeKey = (repo, path) => `/gh/${repo}@main/${path}`;

const MANIFEST = 'manifest.json';

export const DEFAULT_DEPS = {
  fetch: (url) => globalThis.fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) }),
  sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
  readFile: (p) => fs.readFile(repoPath(p)),
  readManifest,
  log: (...a) => console.log(...a),
};

const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');
const short = (v) => (typeof v === 'string' && v.length > 16 ? v.slice(0, 16) : v);

function failReason(err) {
  if (err && (err.name === 'TimeoutError' || err.name === 'AbortError')) return 'timeout';
  return err && err.message ? err.message : String(err);
}

/** Pure: classify one purge response. Returns { ok: true } | { ok: false, reason }. */
export function checkPurgeResponse(httpStatus, body, repo, path) {
  if (!(httpStatus >= 200 && httpStatus < 300)) return { ok: false, reason: `HTTP ${httpStatus}` };
  if (body === null || typeof body !== 'object') return { ok: false, reason: 'body is not JSON' };
  if (body.status !== 'finished') return { ok: false, reason: `status=${body.status}` };
  const key = purgeKey(repo, path);
  const entry = body.paths?.[key];
  if (!entry) return { ok: false, reason: `paths[${key}] missing` };
  if (entry.throttled === true) return { ok: false, reason: 'throttled=true' };
  for (const [provider, v] of Object.entries(entry.providers ?? {})) {
    if (v !== true) return { ok: false, reason: `providers.${provider}=${v}` };
  }
  return { ok: true };
}

/**
 * Pure: freshness of one path. manifest.json → CDN generatedAt >= local generatedAt (string,
 * from readManifest); any other path → SHA-256 of CDN bytes == SHA-256 of local bytes (Buffer).
 * Returns { fresh, cdnValue, localValue }.
 */
export function checkFreshness(path, cdnBuf, local) {
  if (path === MANIFEST) {
    let cdnValue;
    try {
      cdnValue = JSON.parse(Buffer.from(cdnBuf).toString('utf8')).generatedAt;
    } catch {
      return { fresh: false, cdnValue: 'unparsable', localValue: local };
    }
    const fresh = typeof cdnValue === 'string' && cdnValue >= local;
    return { fresh, cdnValue, localValue: local };
  }
  const cdnValue = sha256(cdnBuf);
  const localValue = sha256(local);
  return { fresh: cdnValue === localValue, cdnValue, localValue };
}

function normalisePaths(paths) {
  const out = [];
  for (const raw of paths) {
    const p = String(raw).replace(/^(\.\/|\/)+/, '');
    if (!p) continue;
    if (p.includes('..') || p.startsWith('http')) throw new Error(`invalid purge path: ${raw}`);
    if (p !== MANIFEST && !out.includes(p)) out.push(p);
  }
  return out;
}

/**
 * @param {object} opts
 * @param {string}   opts.repo   owner/name
 * @param {string[]} opts.paths  repo-relative; manifest.json is pulled out and run last (D4)
 * @param {object}  [opts.deps]
 * @returns {Promise<{ ok: boolean, results: Array<{ path, verified, skipped, attempts, lastReason }> }>}
 */
export async function purgeAndVerify({ repo, paths, deps = {} }) {
  const d = { ...DEFAULT_DEPS, ...deps };
  const family = normalisePaths(paths);

  // Local state, read once before any network call.
  const local = new Map();
  const results = new Map();
  const res = (path) => {
    if (!results.has(path)) {
      results.set(path, { path, verified: false, skipped: false, attempts: 0, lastReason: null });
    }
    return results.get(path);
  };
  const live = [];
  for (const p of family) {
    try {
      local.set(p, await d.readFile(p));
      live.push(p);
    } catch (err) {
      if (err && err.code === 'ENOENT') {
        d.log(`::warning::missing local file ${p} — not purged`);
        res(p).skipped = true;
      } else {
        throw err;
      }
    }
  }
  const manifest = await d.readManifest();
  if (!manifest || !manifest.generatedAt) throw new Error('local manifest.json has no generatedAt');
  local.set(MANIFEST, manifest.generatedAt);

  async function purgeOne(path, label) {
    let r;
    try {
      const resp = await d.fetch(purgeUrl(repo, path));
      let body = null;
      try {
        body = await resp.json();
      } catch {
        body = null;
      }
      r = checkPurgeResponse(resp.status, body, repo, path);
      if (r.ok) {
        const prov = body.paths[purgeKey(repo, path)].providers ?? {};
        d.log(
          `purge ${path} ${label}: finished ` +
            Object.entries(prov).map(([k, v]) => `${k}=${v}`).join(' ')
        );
      }
    } catch (err) {
      r = { ok: false, reason: failReason(err) };
    }
    if (!r.ok) d.log(`::warning::purge ${path} ${label}: ${r.reason}`);
    return r;
  }

  async function verifyOne(path, attempt) {
    const entry = res(path);
    let fresh = false;
    let reason = null;
    let cdnValue;
    let localValue = local.get(path);
    let hdr = '';
    try {
      const resp = await d.fetch(cdnUrl(repo, path));
      const xc = resp.headers?.get?.('x-cache');
      const age = resp.headers?.get?.('age');
      hdr = ` x-cache=${xc ?? '-'} age=${age ?? '-'}`;
      if (!(resp.status >= 200 && resp.status < 300)) {
        reason = `HTTP ${resp.status}`;
      } else {
        const buf = Buffer.from(await resp.arrayBuffer());
        ({ fresh, cdnValue, localValue } = checkFreshness(path, buf, local.get(path)));
        if (!fresh) reason = `stale cdn=${short(cdnValue)} local=${short(localValue)}`;
      }
    } catch (err) {
      reason = failReason(err);
    }
    d.log(
      `verify ${path} attempt ${attempt}: ${fresh ? 'fresh' : 'STALE'} ` +
        `cdn=${short(cdnValue) ?? '-'} local=${short(localValue)}${hdr}` +
        (fresh ? '' : ` (${reason})`)
    );
    entry.verified = fresh;
    entry.lastReason = fresh ? null : reason;
    return fresh;
  }

  async function runPhase(phasePaths) {
    let pending = [...phasePaths];
    for (let i = 0; i < PURGE_ATTEMPTS && pending.length; i++) {
      const attempt = i + 1;
      const purged = [];
      for (const p of pending) {
        res(p).attempts = attempt;
        const r = await purgeOne(p, `attempt ${attempt}`);
        if (r.ok) purged.push(p);
        else res(p).lastReason = r.reason;
      }
      if (purged.length) {
        await d.sleep(VERIFY_DELAYS_MS[i]);
        for (const p of purged) await verifyOne(p, attempt);
      }
      pending = pending.filter((p) => !res(p).verified);
    }
  }

  await runPhase(live); // Phase A
  await runPhase([MANIFEST]); // Phase B — runs even if Phase A failed

  // Final sweep: unconditional re-purge, response checked, no verify, never fatal.
  for (const p of [...live, MANIFEST]) await purgeOne(p, 'sweep');

  const out = [...family.map(res), res(MANIFEST)];
  const failed = out.filter((r) => !r.skipped && !r.verified);
  for (const r of failed) {
    d.log(
      `::error::cdn-purge: ${r.path} not verified after ${r.attempts} attempts — ${r.lastReason}`
    );
  }
  return { ok: failed.length === 0, results: out };
}
