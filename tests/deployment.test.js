import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createFeedService } from '../server/service.mjs';
import { checkDeployment } from '../deploy/check.mjs';
import { demoItems } from '../src/data.js';

const date = '2026-10-17';
const instant = new Date(`${date}T10:00:00+08:00`);

function fixture({ page = '<html>NEO<div id="globe"></div></html>', feedDate = date,
  health = { status: 'ok' }, stale = false, status = 200 } = {}) {
  return async url => {
    const path = url.pathname;
    if (path === '/') return new Response(page);
    if (path === '/health') return Response.json(health);
    return Response.json({ version: 2, date: feedDate, fetchedAt: instant.toISOString(),
      items: demoItems(feedDate), stale }, { status });
  };
}

test('deployment check verifies page identity and reports original snapshot provenance including stale', async () => {
  for (const stale of [false, true]) {
    const result = await checkDeployment('https://neo.example', { fetchImpl: fixture({ stale }), now: () => instant });
    assert.deepEqual(result, { status: 'ok', date, targets: 12, fetchedAt: instant.toISOString(), stale });
  }
});

test('deployment check rejects default sites, unhealthy API, stale dates and upstream failures', async () => {
  for (const [options, message] of [
    [{ page: '<html>Default Site</html>' }, /not the NEO/],
    [{ health: { status: 'failed' } }, /Health/],
    [{ feedDate: '2026-10-16' }, /Shanghai date/],
    [{ status: 503 }, /HTTP 503/],
    [{ stale: 'false' }, /Feed is invalid/],
  ]) {
    await assert.rejects(checkDeployment('http://localhost:8081', { fetchImpl: fixture(options), now: () => instant }), message);
  }
});

test('deployment check rejects credentials and non-origin URLs before making requests', async () => {
  for (const url of ['file:///tmp/', 'https://user:secret@neo.example', 'https://neo.example/path', 'https://neo.example/?key=secret']) {
    await assert.rejects(checkDeployment(url, { fetchImpl: () => assert.fail('must not fetch') }), /HTTP\(S\) origin/);
  }
});

test('deployment check works over HTTP with the production API request handler', async t => {
  const api = createFeedService({ now: () => instant.getTime(), load: async () => demoItems(date) });
  const server = createServer((req, res) => {
    if (req.url === '/') { res.end('<html>NEO<div id="globe"></div></html>'); return; }
    api.emit('request', req, res);
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  const result = await checkDeployment(`http://127.0.0.1:${server.address().port}`, { now: () => instant });
  assert.equal(result.date, date);
  assert.equal(result.targets, 12);
  assert.equal(result.stale, false);
});
