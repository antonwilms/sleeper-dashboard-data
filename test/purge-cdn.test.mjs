/**
 * test/purge-cdn.test.mjs — purgeAndVerify control flow and the two pure checkers.
 * No network: fetch/sleep/readFile/readManifest/log are injected.
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
const LOCAL_GEN = '2026-10-02T20:55:13.585Z';
const OLD_GEN = '2026-10-01T00:00:00.000Z';
const NEW_GEN = '2026-10-03T00:00:00.000Z';

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
const manifestResp = (gen) => bytesResp(Buffer.from(JSON.stringify({ generatedAt: gen })));

/**
 * Harness. `cdn(path, n)` returns the verify response for the nth CDN fetch of path;
 * `purge(path, n)` returns the purge response (default: ok) for the nth purge of path.
 */
function harness({ locals = {}, cdn, purge, manifestGen = LOCAL_GEN, readManifest } = {}) {
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
    readManifest: readManifest ?? (() => ({ generatedAt: manifestGen })),
    log: (...a) => calls.logs.push(a.join(' ')),
  };
  return { deps, calls };
}
const fresh = (locals) => (p) => (p === 'manifest.json' ? manifestResp(LOCAL_GEN) : bytesResp(Buffer.from(locals[p])));

test('happy path: family then manifest, then sweep; one sleep per phase', async () => {
  const locals = { 'nflverse/x.json': 'xbytes' };
  const { deps, calls } = harness({ locals, cdn: fresh(locals) });
  const r = await purgeAndVerify({ repo: REPO, paths: ['manifest.json', 'nflverse/x.json'], deps });
  assert.equal(r.ok, true);
  assert.deepEqual(calls.purges, ['nflverse/x.json', 'manifest.json', 'nflverse/x.json', 'manifest.json']);
  assert.deepEqual(calls.sleeps, [15_000, 15_000]);
  assert.ok(r.results.every((x) => x.verified && x.attempts === 1));
});

test('manifest last and de-duplicated; empty paths = manifest phase + one-path sweep', async () => {
  const locals = { 'nflverse/x.json': 'x' };
  let h = harness({ locals, cdn: fresh(locals) });
  await purgeAndVerify({ repo: REPO, paths: ['manifest.json', 'nflverse/x.json', './nflverse/x.json'], deps: h.deps });
  assert.deepEqual(h.calls.purges.slice(0, 2), ['nflverse/x.json', 'manifest.json']);
  assert.equal(h.calls.purges.length, 4);

  h = harness({ cdn: fresh({}) });
  const r = await purgeAndVerify({ repo: REPO, paths: [], deps: h.deps });
  assert.equal(r.ok, true);
  assert.deepEqual(h.calls.purges, ['manifest.json', 'manifest.json']);
});

test('purge HTTP 503 then success: warning, re-purge on attempt 2, verified', async () => {
  const { deps, calls } = harness({
    cdn: fresh({}),
    purge: (p, n) => (p === 'manifest.json' && n === 1 ? jsonResp(503, null) : undefined),
  });
  const r = await purgeAndVerify({ repo: REPO, paths: [], deps });
  assert.equal(r.ok, true);
  assert.ok(calls.logs.some((l) => l.startsWith('::warning::') && l.includes('HTTP 503')));
  assert.equal(r.results[0].attempts, 2);
  assert.deepEqual(calls.sleeps, [15_000, 30_000]); // back-off after the failed attempt 1, then the verify delay of attempt 2
});

test('throttled:true and providers.FY:false each fail with a reason naming the field', () => {
  const p = 'manifest.json';
  const t = checkPurgeResponse(200, bodyWith(p, { throttled: true }), REPO, p);
  assert.equal(t.ok, false);
  assert.match(t.reason, /throttled/);
  const f = checkPurgeResponse(200, bodyWith(p, { providers: { CF: true, FY: false } }), REPO, p);
  assert.equal(f.ok, false);
  assert.match(f.reason, /FY/);
  assert.deepEqual(checkPurgeResponse(200, okBody(p), REPO, p), { ok: true });
});

test('stale then fresh: manifest re-purged once more; only still-stale family file is re-purged', async () => {
  let h = harness({ cdn: (p, n) => manifestResp(n === 1 ? OLD_GEN : LOCAL_GEN) });
  let r = await purgeAndVerify({ repo: REPO, paths: [], deps: h.deps });
  assert.equal(r.ok, true);
  // 2 phase purges + 1 sweep
  assert.equal(h.calls.purges.filter((p) => p === 'manifest.json').length, 3);

  const locals = { 'a.json': 'A', 'b.json': 'B' };
  h = harness({
    locals,
    cdn: (p, n) =>
      p === 'manifest.json' ? manifestResp(LOCAL_GEN) : p === 'b.json' && n === 1 ? bytesResp(Buffer.from('old')) : bytesResp(Buffer.from(locals[p])),
  });
  r = await purgeAndVerify({ repo: REPO, paths: ['a.json', 'b.json'], deps: h.deps });
  assert.equal(r.ok, true);
  // a: attempt 1 + sweep; b: attempt 1, 2 + sweep
  assert.equal(h.calls.purges.filter((p) => p === 'a.json').length, 2);
  assert.equal(h.calls.purges.filter((p) => p === 'b.json').length, 3);
});

test('newer CDN manifest counts as fresh', async () => {
  const { deps, calls } = harness({ cdn: () => manifestResp(NEW_GEN) });
  const r = await purgeAndVerify({ repo: REPO, paths: [], deps });
  assert.equal(r.ok, true);
  assert.equal(r.results[0].attempts, 1);
  assert.equal(calls.sleeps.length, 1);
});

test('never fresh: 5 phase purges, manifest phase still runs, one ::error::, ok false', async () => {
  const locals = { 'nflverse/x.json': 'right' };
  const { deps, calls } = harness({
    locals,
    cdn: (p) => (p === 'manifest.json' ? manifestResp(LOCAL_GEN) : bytesResp(Buffer.from('wrong'))),
  });
  const r = await purgeAndVerify({ repo: REPO, paths: ['nflverse/x.json'], deps });
  assert.equal(r.ok, false);
  assert.equal(PURGE_ATTEMPTS, 5);
  // Phase A: 5 purges + 5 sleeps; Phase B: 1 purge + 1 sleep; sweep: 2 purges
  assert.equal(calls.purges.filter((p) => p === 'nflverse/x.json').length, 5 + 1);
  assert.deepEqual(calls.sleeps.slice(0, 5), VERIFY_DELAYS_MS);
  assert.equal(calls.sleeps.length, 6);
  const manifest = r.results.find((x) => x.path === 'manifest.json');
  assert.equal(manifest.verified, true);
  const errs = calls.logs.filter((l) => l.startsWith('::error::'));
  assert.equal(errs.length, 1);
  assert.ok(errs[0].includes('nflverse/x.json'));
});

test('invalid paths throw before any fetch', async () => {
  for (const bad of ['../x', 'https://evil.example/x.json']) {
    const h = harness({ cdn: fresh({}) });
    await assert.rejects(purgeAndVerify({ repo: REPO, paths: [bad], deps: h.deps }), /invalid purge path/);
    assert.equal(h.calls.purges.length + h.calls.verifies.length, 0);
  }
});

test('missing local family file: warned, skipped, never fetched; manifest runs; ok', async () => {
  const { deps, calls } = harness({ cdn: fresh({}) });
  const r = await purgeAndVerify({ repo: REPO, paths: ['nflverse/gamelogs/2026.json'], deps });
  assert.equal(r.ok, true);
  assert.ok(calls.logs.some((l) => l.startsWith('::warning::missing local file nflverse/gamelogs/2026.json')));
  assert.ok(![...calls.purges, ...calls.verifies].includes('nflverse/gamelogs/2026.json'));
  assert.equal(r.results.find((x) => x.path === 'nflverse/gamelogs/2026.json').skipped, true);
  assert.ok(calls.purges.includes('manifest.json'));
});

test('falsy readManifest() or missing generatedAt throws before any fetch', async () => {
  for (const rm of [() => null, () => ({})]) {
    const h = harness({ cdn: fresh({}), readManifest: rm });
    await assert.rejects(purgeAndVerify({ repo: REPO, paths: [], deps: h.deps }), /generatedAt/);
    assert.equal(h.calls.purges.length + h.calls.verifies.length, 0);
  }
});

test('checkPurgeResponse: null body, repo-relative key, throttled each fail', () => {
  assert.equal(checkPurgeResponse(200, null, REPO, 'manifest.json').ok, false);
  const relKey = { status: 'finished', paths: { 'manifest.json': { throttled: false, providers: { CF: true } } } };
  assert.equal(checkPurgeResponse(200, relKey, REPO, 'manifest.json').ok, false);
  assert.equal(checkPurgeResponse(200, bodyWith('manifest.json', { throttled: true }), REPO, 'manifest.json').ok, false);
});

test('fetch throwing AbortError on first purge: warning (timeout), retried, ok', async () => {
  const { deps, calls } = harness({
    cdn: fresh({}),
    purge: (p, n) => (n === 1 ? Object.assign(new Error('aborted'), { name: 'AbortError' }) : undefined),
  });
  const r = await purgeAndVerify({ repo: REPO, paths: [], deps });
  assert.equal(r.ok, true);
  assert.ok(calls.logs.some((l) => l.startsWith('::warning::') && l.includes('timeout')));
});

test('sweep failure is non-fatal: warning, still ok', async () => {
  const { deps, calls } = harness({
    cdn: fresh({}),
    purge: (p, n) => (n === 2 ? jsonResp(503, null) : undefined), // 2nd manifest purge = the sweep
  });
  const r = await purgeAndVerify({ repo: REPO, paths: [], deps });
  assert.equal(r.ok, true);
  assert.ok(calls.logs.some((l) => l.includes('sweep') && l.startsWith('::warning::')));
});

test('checkFreshness: manifest ISO compare, other paths SHA-256', () => {
  const buf = Buffer.from(JSON.stringify({ generatedAt: LOCAL_GEN }));
  assert.equal(checkFreshness('manifest.json', buf, LOCAL_GEN).fresh, true);
  assert.equal(checkFreshness('manifest.json', buf, NEW_GEN).fresh, false);
  assert.equal(checkFreshness('manifest.json', Buffer.from('<html>'), LOCAL_GEN).fresh, false);
  assert.equal(checkFreshness('a.json', Buffer.from('x'), Buffer.from('x')).fresh, true);
  assert.equal(checkFreshness('a.json', Buffer.from('x'), Buffer.from('y')).fresh, false);
});

test('every purge 503 on all attempts: back-off sleeps except after the last, ok false', async () => {
  const { deps, calls } = harness({ cdn: fresh({}), purge: (p, n) => (n <= 5 ? jsonResp(503, null) : undefined) });
  const r = await purgeAndVerify({ repo: REPO, paths: [], deps });
  assert.equal(r.ok, false);
  assert.deepEqual(calls.sleeps, VERIFY_DELAYS_MS.slice(0, 4));
  assert.equal(calls.purges.filter((p) => p === 'manifest.json').length, 5 + 1);
  assert.equal(calls.verifies.length, 0);
});

test('checkPurgeResponse: empty or absent providers fail with "providers missing"', () => {
  const p = 'manifest.json';
  const empty = checkPurgeResponse(200, bodyWith(p, { providers: {} }), REPO, p);
  assert.equal(empty.ok, false);
  assert.match(empty.reason, /providers missing/);
  const b = okBody(p);
  delete b.paths['/gh/' + REPO + '@main/' + p].providers;
  const absent = checkPurgeResponse(200, b, REPO, p);
  assert.equal(absent.ok, false);
  assert.match(absent.reason, /providers missing/);
});

test('non-2xx verify on attempt 1 logs STALE and HTTP 404; attempt 2 fresh, ok', async () => {
  const locals = { 'a.json': 'A' };
  const { deps, calls } = harness({
    locals,
    cdn: (p, n) =>
      p === 'manifest.json' ? manifestResp(LOCAL_GEN) : n === 1 ? bytesResp(Buffer.from(''), 404) : bytesResp(Buffer.from('A')),
  });
  const r = await purgeAndVerify({ repo: REPO, paths: ['a.json'], deps });
  assert.equal(r.ok, true);
  const line = calls.logs.find((l) => l.startsWith('verify a.json attempt 1'));
  assert.ok(line.includes('STALE') && line.includes('HTTP 404'));
});

test('verify log line carries x-cache and age headers', async () => {
  const resp = manifestResp(LOCAL_GEN);
  resp.headers = { get: (h) => (h === 'x-cache' ? 'HIT' : h === 'age' ? '12' : null) };
  const { deps, calls } = harness({ cdn: () => resp });
  await purgeAndVerify({ repo: REPO, paths: [], deps });
  assert.ok(calls.logs.some((l) => l.startsWith('verify manifest.json') && l.includes('x-cache=HIT age=12')));
});

test('seconds-stale manifest logs both full timestamps', async () => {
  const cdnGen = '2026-10-02T20:55:01.000Z';
  const { deps, calls } = harness({ cdn: (p, n) => manifestResp(n === 1 ? cdnGen : LOCAL_GEN) });
  await purgeAndVerify({ repo: REPO, paths: [], deps });
  const line = calls.logs.find((l) => l.startsWith('verify manifest.json attempt 1'));
  assert.ok(line.includes(cdnGen) && line.includes(LOCAL_GEN));
});
