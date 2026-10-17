import { pathToFileURL } from 'node:url';
import { readFeedCache } from '../src/cache.js';
import { shanghaiDate } from '../src/data.js';

// Verify the same public entry point for both Docker and native deployments.
export async function checkDeployment(baseUrl, { fetchImpl = fetch, now = () => new Date() } = {}) {
  const base = new URL(baseUrl);
  if (!['http:', 'https:'].includes(base.protocol) || base.username || base.password
    || base.pathname !== '/' || base.search || base.hash) {
    throw new Error('Provide an HTTP(S) origin without credentials, path or query');
  }
  async function get(path) {
    const response = await fetchImpl(new URL(path, base), {
      signal: AbortSignal.timeout(20_000), cache: 'no-store',
    });
    if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`);
    return response;
  }
  const html = await (await get('/')).text();
  if (!/id=["']globe["']/.test(html) || !html.includes('NEO')) {
    throw new Error('Entry point is not the NEO Watch page');
  }
  const health = await (await get('/health')).json();
  if (health.status !== 'ok') throw new Error('Health response is invalid');
  const body = await (await get('/api/neo/today')).json();
  const snapshot = readFeedCache({ getItem: () => JSON.stringify(body) }, shanghaiDate(now()));
  if (!snapshot || typeof body.stale !== 'boolean') {
    throw new Error('Feed is invalid or does not match the current Shanghai date');
  }
  return { status: 'ok', date: snapshot.date, targets: snapshot.items.length,
    fetchedAt: snapshot.fetchedAt, stale: body.stale };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    console.log(JSON.stringify(await checkDeployment(process.argv[2] || 'http://127.0.0.1:8081')));
  } catch (error) {
    // Do not print URLs or underlying network errors, which may contain configuration.
    console.error(error instanceof TypeError ? 'Deployment check failed: invalid origin or network unavailable' : error.message);
    process.exitCode = 1;
  }
}
