import { createServer } from 'node:http';
import { readFile, writeFile, rename } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { shanghaiDate, fetchTodayFeed } from '../src/data.js';
import { readFeedCache } from '../src/cache.js';

export function createFeedService({ apiKey, load = fetchTodayFeed, now = () => Date.now(),
  ttlMs = 600_000, retryMs = 30_000, cacheFile = null } = {}) {
  let cache = null;
  let pending = null;
  let retryAfter = 0;
  let retryDate = null;
  const restored = cacheFile ? readFile(cacheFile, 'utf8').then(text => {
    cache = readFeedCache({ getItem: () => text }, shanghaiDate(new Date(now())));
  }).catch(() => {}) : Promise.resolve();

  async function getSnapshot() {
    await restored;
    const date = shanghaiDate(new Date(now()));
    const sameDay = () => cache?.date === date;
    const result = stale => ({ ...cache, stale });
    if (sameDay() && now() - Date.parse(cache.fetchedAt) < ttlMs) return result(false);
    if (retryDate === date && now() < retryAfter) {
      if (sameDay()) return result(true);
      throw new Error('NASA temporarily unavailable');
    }
    if (pending) {
      await pending;
      return getSnapshot();
    }
    pending = (async () => {
      try {
        const items = await load({ date, apiKey, timeoutMs: 12_000 });
        cache = { version: 2, date, fetchedAt: new Date(now()).toISOString(), items };
        retryAfter = 0; retryDate = null;
        if (cacheFile) {
          try {
            await writeFile(`${cacheFile}.tmp`, JSON.stringify(cache), { mode: 0o600 });
            await rename(`${cacheFile}.tmp`, cacheFile);
          } catch { console.warn('Feed cache persistence failed'); }
        }
      } catch {
        retryDate = date; retryAfter = now() + retryMs;
      }
    })();
    try { await pending; } finally { pending = null; }
    if (!sameDay()) throw new Error('NASA temporarily unavailable');
    return result(retryDate === date && now() < retryAfter);
  }

  return createServer(async (req, res) => {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    if (req.method !== 'GET') {
      res.setHeader('Allow', 'GET'); res.writeHead(405); res.end('{"error":"Method not allowed"}'); return;
    }
    if (req.url === '/health') { res.end('{"status":"ok"}'); return; }
    if (req.url !== '/api/neo/today') { res.writeHead(404); res.end('{"error":"Not found"}'); return; }
    try { res.end(JSON.stringify(await getSnapshot())); }
    catch { res.writeHead(503); res.end('{"error":"NASA data temporarily unavailable"}'); }
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const apiKey = process.env.NASA_API_KEY;
  if (!apiKey || apiKey === 'DEMO_KEY') throw new Error('Configure NASA_API_KEY before starting the production service');
  const server = createFeedService({ apiKey, cacheFile: process.env.FEED_CACHE_FILE || null });
  server.listen(Number(process.env.PORT || 8080), process.env.HOST || '0.0.0.0', () => console.log('NEO Watch API ready'));
  const shutdown = () => { server.close(() => process.exit(0)); setTimeout(() => process.exit(1), 5000).unref(); };
  process.on('SIGTERM', shutdown); process.on('SIGINT', shutdown);
}
