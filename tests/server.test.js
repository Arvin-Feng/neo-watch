import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createFeedService } from '../server/service.mjs';
import { demoItems } from '../src/data.js';
import { fetchFeedSnapshot } from '../src/feed.js';

const start = Date.parse('2026-10-16T02:00:00Z');
const date = '2026-10-16';
function request(server, url = '/api/neo/today', method = 'GET') {
  return new Promise(resolve => {
    const response = { status: 200, headers: {},
      setHeader(key, value) { this.headers[key] = value; },
      writeHead(status) { this.status = status; },
      end(body) { resolve({ status: this.status, headers: this.headers, body: JSON.parse(body) }); } };
    server.emit('request', { url, method }, response);
  });
}

test('concurrent visitors share one upstream call and the original fetchedAt', async () => {
  let clock = start; let calls = 0; let release;
  const gate = new Promise(resolve => { release = resolve; });
  const server = createFeedService({ apiKey: 'PRIVATE_TEST_KEY', now: () => clock, load: async () => {
    calls++; await gate; return demoItems(date);
  } });
  const responses = Promise.all(Array.from({ length: 20 }, () => request(server)));
  release();
  const all = await responses;
  assert.equal(calls, 1);
  assert.ok(all.every(r => r.status === 200 && r.body.stale === false && r.body.date === date));
  assert.ok(!JSON.stringify(all).includes('PRIVATE_TEST_KEY'));
  clock += 30_000;
  assert.equal((await request(server)).body.fetchedAt, new Date(start).toISOString());
  assert.equal(calls, 1);
  clock += 600_000;
  assert.equal((await request(server)).body.fetchedAt, new Date(clock).toISOString());
  assert.equal(calls, 2);
});

test('upstream failure keeps same-day data stale, preserves time and backs off retries', async () => {
  let clock = start; let failed = false; let calls = 0;
  const server = createFeedService({ now: () => clock, load: async () => {
    calls++; if (failed) throw new Error('secret upstream URL'); return demoItems(date);
  } });
  await request(server);
  clock += 600_001; failed = true;
  const result = await request(server);
  assert.equal(result.status, 200); assert.equal(result.body.stale, true);
  assert.equal(result.body.fetchedAt, new Date(start).toISOString());
  await request(server); assert.equal(calls, 2);
  clock += 30_001;
  await request(server); assert.equal(calls, 3);
});

test('Shanghai date change never labels previous-day data as today; only fixed GET routes are accepted', async () => {
  let clock = start; let failed = false;
  const server = createFeedService({ now: () => clock, load: async () => {
    if (failed) throw new Error('PRIVATE_TEST_KEY'); return demoItems(date);
  } });
  await request(server);
  clock = Date.parse('2026-10-16T16:00:00Z'); failed = true;
  const result = await request(server);
  assert.equal(result.status, 503);
  assert.ok(!JSON.stringify(result.body).includes('PRIVATE_TEST_KEY'));
  assert.equal((await request(server, '/api/neo/today?date=2020-01-01')).status, 404);
  assert.equal((await request(server, '/api/neo/today', 'POST')).status, 405);
  assert.equal((await request(server, '/health')).status, 200);
});

test('disk cache survives service restarts and remains restricted to its date', async () => {
  const cacheFile = join(await mkdtemp(join(tmpdir(), 'neo-watch-test-')), 'today.json');
  const first = createFeedService({ now: () => start, cacheFile, load: async () => demoItems(date) });
  await request(first);
  assert.equal(JSON.parse(await readFile(cacheFile, 'utf8')).date, date);
  let calls = 0;
  const restored = createFeedService({ now: () => start + 60_000, cacheFile, load: async () => { calls++; throw new Error('offline'); } });
  assert.equal((await request(restored)).status, 200); assert.equal(calls, 0);
  const tomorrow = createFeedService({ now: () => start + 86_400_000, cacheFile, load: async () => { throw new Error('offline'); } });
  assert.equal((await request(tomorrow)).status, 503);
});

test('browser snapshot loading preserves provenance and rejects wrong dates and malformed responses', async () => {
  const body = { version: 2, date, fetchedAt: new Date(start).toISOString(), items: demoItems(date), stale: true };
  let endpoint;
  const loaded = await fetchFeedSnapshot({ date, endpoint: '/api/neo/today', fetchImpl: async url => {
    endpoint = url; return { ok: true, json: async () => body };
  } });
  assert.equal(endpoint, '/api/neo/today'); assert.equal(loaded.stale, true);
  assert.equal(loaded.fetchedAt, body.fetchedAt);
  await assert.rejects(fetchFeedSnapshot({ date: '2026-10-17', endpoint, fetchImpl: async () => ({ ok: true, json: async () => body }) }), /日期或格式/);
  await assert.rejects(fetchFeedSnapshot({ date, endpoint, fetchImpl: async () => ({ ok: false }) }), /暂时不可用/);
});
