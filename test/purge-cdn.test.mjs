/**
 * test/purge-cdn.test.mjs — purgeAndVerify control flow and the two pure checkers.
 * No network: fetch/sleep/readFile/log are injected. manifest.json is never purged (CR-29).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  purgeAndVerify,
  checkPurgeResponse,
  checkFreshness,
  VERIFY_DELAYS_MS,
  PURGE_ATTEMPTS,
} from '../scripts/purge-cdn.mjs';

const REPO = 'antonwilms/sleeper-dashboard-data';
const A = 'nflverse/oline/2026.json';
const B = 'nflverse/depth/2026.json';

// Verbatim jsDelivr shape; key built by literal concatenation, NOT via purgeKey.
const okBody = (path) => ({
  id: 'abc',
  status: 'finished',
  timestamp: '2026-10-02T20:55:16.000Z',
  paths: { ['/gh/' + REPO + '@main/' + path]: { throttled: false, providers: { CF: true, FY: true } } },
});
const bodyWith = (path, over) => {
  const b = okBody(path);
  Object.assign(b.paths['/gh/' + REPO + '@main/' + path], over);
  return b;
};
const jsonResp = (status, body) => ({ status, json: async () => body, headers: { get: () => null } });
const bytesResp = (buf, status = 200) => ({
  status,
  arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength),
  headers: { get: (h) => (h === 'x-cache' ? 'MISS' : h === 'age' ? '0' : null) },
});

/**
 * Harness. `cdn(path, n)` returns the verify response for the nth CDN fetch of path;
 * `purge(path, n)` returns the purge response (default: ok) for the nth purge of path.
 */
function harness({ locals = { [A]: 'abytes' }, cdn, purge } = {}) {
  const calls = { purges: [], verifies: [], sleeps: [], logs: [] };
  const counts = {};
  const next = (kind, p) => ((counts[kind + p] = (counts[kind + p] ?? 0) + 1));
  const deps = {
    fetch: async (url) => {
      if (url.startsWith('https://purge.jsdelivr.net/')) {
        const p = url.split('@main/')[1];
        calls.purges.push(p);
        const n = next('p', p);
        const r = purge ? purge(p, n) : undefined;
        if (r instanceof Error) throw r;
        return r ?? jsonResp(200, okBody(p));
      }
      assert.ok(url.startsWith('https://cdn.jsdelivr.net/'));
      assert.ok(!url.includes('?'), 'verify URL must carry no cache-buster');
      const p = url.split('@main/')[1];
      calls.verifies.push(p);
      return cdn(p, next('c', p));
    },
    sleep: async (ms) => calls.sleeps.push(ms),
    readFile: async (p) => {
      if (!(p in locals)) throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
      return Buffer.from(locals[p]);
    },
    log: (...a) => calls.logs.push(a.join(' ')),
  };
  return { deps, calls };
}
const fresh = (locals) => (p) => bytesResp(Buffer.from(locals[p]));

test('happy path: purge, one verify sleep, verify, then sweep', async () => {
  const locals = { [A]: 'abytes', [B]: 'bbytes' };
  const { deps, calls } = harness({ locals, cdn: fresh(locals) });
  const r = await purgeAndVerify({ repo: REPO, paths: [A, B], deps });
  assert.equal(r.ok, true);
  assert.deepEqual(calls.purges, [A, B, A, B]);
  assert.deepEqual(calls.sleeps, [15_000]);
  assert.ok(r.results.every((x) => x.verified && x.attempts === 1));
  assert.ok(![...calls.purges, ...calls.verifies].includes('manifest.json'));
});

test('paths are de-duplicated and normalised', async () => {
  const locals = { [A]: 'x' };
  const h = harness({ locals, cdn: fresh(locals) });
  await purgeAndVerify({ repo: REPO, paths: [A, './' + A], deps: h.deps });
  assert.deepEqual(h.calls.purges, [A, A]); // phase purge + sweep
});

test('purge HTTP 503 then success: warning, re-purge on attempt 2, verified', async () => {
  const locals = { [A]: 'x' };
  const { deps, calls } = harness({
    locals,
    cdn: fresh(locals),
    purge: (p, n) => (n === 1 ? jsonResp(503, null) : undefined),
  });
  const r = await purgeAndVerify({ repo: REPO, paths: [A], deps });
  assert.equal(r.ok, true);
  assert.ok(calls.logs.some((l) => l.startsWith('::warning::') && l.includes('HTTP 503')));
  assert.equal(r.results[0].attempts, 2);
  assert.deepEqual(calls.sleeps, [15_000, 30_000]); // back-off after the failed attempt 1, then the verify delay of attempt 2
});

test('throttled:true and providers.FY:false each fail with a reason naming the field', () => {
  const t = checkPurgeResponse(200, bodyWith(A, { throttled: true }), REPO, A);
  assert.equal(t.ok, false);
  assert.match(t.reason, /throttled/);
  const f = checkPurgeResponse(200, bodyWith(A, { providers: { CF: true, FY: false } }), REPO, A);
  assert.equal(f.ok, false);
  assert.match(f.reason, /FY/);
  assert.deepEqual(checkPurgeResponse(200, okBody(A), REPO, A), { ok: true });
});

test('throttled purge on every attempt, CDN already fresh: verified, ok, no ::error::', async () => {
  const locals = { [A]: 'x' };
  const { deps, calls } = harness({
    locals,
    cdn: fresh(locals),
    purge: (path) => jsonResp(200, bodyWith(path, { throttled: true, providers: undefined })),
  });
  const r = await purgeAndVerify({ repo: REPO, paths: [A], deps });
  assert.equal(r.ok, true);
  assert.equal(r.results[0].verified, true);
  assert.equal(r.results[0].attempts, 1);
  assert.ok(calls.logs.some((l) => l.startsWith('::warning::') && l.includes('throttled=true')));
  assert.equal(calls.logs.filter((l) => l.startsWith('::error::')).length, 0);
  assert.equal(checkPurgeResponse(200, bodyWith(A, { throttled: true }), REPO, A).throttled, true);
});

test('throttled purge and CDN stale on every verify: fails, reason is the stale verify', async () => {
  const { deps, calls } = harness({
    cdn: () => bytesResp(Buffer.from('old')),
    purge: (path) => jsonResp(200, bodyWith(path, { throttled: true })),
  });
  const r = await purgeAndVerify({ repo: REPO, paths: [A], deps });
  assert.equal(r.ok, false);
  assert.equal(calls.verifies.length, PURGE_ATTEMPTS);
  assert.match(r.results[0].lastReason, /^stale/);
  assert.equal(calls.logs.filter((l) => l.startsWith('::error::')).length, 1);
});

test('stale then fresh: only the still-stale family file is re-purged', async () => {
  const locals = { [A]: 'A', [B]: 'B' };
  const h = harness({
    locals,
    cdn: (p, n) => (p === B && n === 1 ? bytesResp(Buffer.from('old')) : bytesResp(Buffer.from(locals[p]))),
  });
  const r = await purgeAndVerify({ repo: REPO, paths: [A, B], deps: h.deps });
  assert.equal(r.ok, true);
  // a: attempt 1 + sweep; b: attempt 1, 2 + sweep
  assert.equal(h.calls.purges.filter((p) => p === A).length, 2);
  assert.equal(h.calls.purges.filter((p) => p === B).length, 3);
});

test('never fresh: 5 phase purges + sweep, 5 verify sleeps, one ::error::, ok false', async () => {
  const locals = { [A]: 'right' };
  const { deps, calls } = harness({ locals, cdn: () => bytesResp(Buffer.from('wrong')) });
  const r = await purgeAndVerify({ repo: REPO, paths: [A], deps });
  assert.equal(r.ok, false);
  assert.equal(PURGE_ATTEMPTS, 5);
  assert.equal(calls.purges.filter((p) => p === A).length, 5 + 1);
  assert.deepEqual(calls.sleeps, VERIFY_DELAYS_MS);
  const errs = calls.logs.filter((l) => l.startsWith('::error::'));
  assert.equal(errs.length, 1);
  assert.ok(errs[0].includes(A));
});

test('invalid paths throw before any fetch, including manifest.json', async () => {
  for (const bad of ['../x', 'https://evil.example/x.json', 'manifest.json', './manifest.json', '/manifest.json']) {
    const h = harness({ cdn: fresh({}) });
    await assert.rejects(purgeAndVerify({ repo: REPO, paths: [A, bad], deps: h.deps }), /invalid purge path/);
    assert.equal(h.calls.purges.length + h.calls.verifies.length, 0);
  }
  const h = harness({ cdn: fresh({}) });
  await assert.rejects(purgeAndVerify({ repo: REPO, paths: ['manifest.json'], deps: h.deps }), /manifest\.json is not purged \(CR-29\)/);
});

test('empty path list throws before any fetch', async () => {
  for (const paths of [[], ['', './']]) {
    const h = harness({ cdn: fresh({}) });
    await assert.rejects(purgeAndVerify({ repo: REPO, paths, deps: h.deps }), /no paths to purge/);
    assert.equal(h.calls.purges.length + h.calls.verifies.length, 0);
  }
});

test('missing local family file: warned, skipped, never fetched; other paths still run; ok', async () => {
  const locals = { [A]: 'x' };
  const { deps, calls } = harness({ locals, cdn: fresh(locals) });
  const r = await purgeAndVerify({ repo: REPO, paths: ['nflverse/gamelogs/2026.json', A], deps });
  assert.equal(r.ok, true);
  assert.ok(calls.logs.some((l) => l.startsWith('::warning::missing local file nflverse/gamelogs/2026.json')));
  assert.ok(![...calls.purges, ...calls.verifies].includes('nflverse/gamelogs/2026.json'));
  assert.equal(r.results.find((x) => x.path === 'nflverse/gamelogs/2026.json').skipped, true);
  assert.ok(calls.purges.includes(A));
});

test('checkPurgeResponse: null body, repo-relative key, throttled each fail', () => {
  assert.equal(checkPurgeResponse(200, null, REPO, A).ok, false);
  const relKey = { status: 'finished', paths: { [A]: { throttled: false, providers: { CF: true } } } };
  assert.equal(checkPurgeResponse(200, relKey, REPO, A).ok, false);
  assert.equal(checkPurgeResponse(200, bodyWith(A, { throttled: true }), REPO, A).ok, false);
});

test('fetch throwing AbortError on first purge: warning (timeout), retried, ok', async () => {
  const locals = { [A]: 'x' };
  const { deps, calls } = harness({
    locals,
    cdn: fresh(locals),
    purge: (p, n) => (n === 1 ? Object.assign(new Error('aborted'), { name: 'AbortError' }) : undefined),
  });
  const r = await purgeAndVerify({ repo: REPO, paths: [A], deps });
  assert.equal(r.ok, true);
  assert.ok(calls.logs.some((l) => l.startsWith('::warning::') && l.includes('timeout')));
});

test('sweep failure is non-fatal: warning, still ok', async () => {
  const locals = { [A]: 'x' };
  const { deps, calls } = harness({
    locals,
    cdn: fresh(locals),
    purge: (p, n) => (n === 2 ? jsonResp(503, null) : undefined), // 2nd purge = the sweep
  });
  const r = await purgeAndVerify({ repo: REPO, paths: [A], deps });
  assert.equal(r.ok, true);
  assert.ok(calls.logs.some((l) => l.includes('sweep') && l.startsWith('::warning::')));
});

test('checkFreshness is SHA-256 only (Buffer vs Buffer)', () => {
  assert.equal(checkFreshness(Buffer.from('x'), Buffer.from('x')).fresh, true);
  assert.equal(checkFreshness(Buffer.from('x'), Buffer.from('y')).fresh, false);
  // JSON that merely looks like a manifest freshness record is compared by bytes, not by generatedAt
  const newer = Buffer.from(JSON.stringify({ generatedAt: '2026-10-03T00:00:00.000Z' }));
  const older = Buffer.from(JSON.stringify({ generatedAt: '2026-10-01T00:00:00.000Z' }));
  assert.equal(checkFreshness(newer, older).fresh, false);
});

test('every purge 503 on all attempts: back-off sleeps except after the last, ok false', async () => {
  const locals = { [A]: 'x' };
  const { deps, calls } = harness({ locals, cdn: fresh(locals), purge: (p, n) => (n <= 5 ? jsonResp(503, null) : undefined) });
  const r = await purgeAndVerify({ repo: REPO, paths: [A], deps });
  assert.equal(r.ok, false);
  assert.deepEqual(calls.sleeps, VERIFY_DELAYS_MS.slice(0, 4));
  assert.equal(calls.purges.filter((p) => p === A).length, 5 + 1);
  assert.equal(calls.verifies.length, 0);
});

test('checkPurgeResponse: empty or absent providers fail with "providers missing"', () => {
  const empty = checkPurgeResponse(200, bodyWith(A, { providers: {} }), REPO, A);
  assert.equal(empty.ok, false);
  assert.match(empty.reason, /providers missing/);
  const b = okBody(A);
  delete b.paths['/gh/' + REPO + '@main/' + A].providers;
  const absent = checkPurgeResponse(200, b, REPO, A);
  assert.equal(absent.ok, false);
  assert.match(absent.reason, /providers missing/);
});

test('non-2xx verify on attempt 1 logs STALE and HTTP 404; attempt 2 fresh, ok', async () => {
  const locals = { 'a.json': 'A' };
  const { deps, calls } = harness({
    locals,
    cdn: (p, n) => (n === 1 ? bytesResp(Buffer.from(''), 404) : bytesResp(Buffer.from('A'))),
  });
  const r = await purgeAndVerify({ repo: REPO, paths: ['a.json'], deps });
  assert.equal(r.ok, true);
  const line = calls.logs.find((l) => l.startsWith('verify a.json attempt 1'));
  assert.ok(line.includes('STALE') && line.includes('HTTP 404'));
});

test('verify log line carries x-cache and age headers', async () => {
  const resp = bytesResp(Buffer.from('x'));
  resp.headers = { get: (h) => (h === 'x-cache' ? 'HIT' : h === 'age' ? '12' : null) };
  const { deps, calls } = harness({ locals: { [A]: 'x' }, cdn: () => resp });
  await purgeAndVerify({ repo: REPO, paths: [A], deps });
  assert.ok(calls.logs.some((l) => l.startsWith(`verify ${A}`) && l.includes('x-cache=HIT age=12')));
});
