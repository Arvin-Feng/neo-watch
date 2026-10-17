import { readFeedCache } from './cache.js';

// Reuse the same field/date validation used for browser cache snapshots.
export async function fetchFeedSnapshot({ date, endpoint, timeoutMs = 15_000, fetchImpl = fetch }) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(endpoint, { signal: controller.signal, cache: 'no-store' });
    if (!response.ok) throw new Error('NASA 数据服务暂时不可用，请稍后重试或进入演示。');
    const body = await response.json();
    const snapshot = readFeedCache({ getItem: () => JSON.stringify(body) }, date);
    if (!snapshot || typeof body.stale !== 'boolean') throw new Error('数据日期或格式不匹配，请刷新页面后重试。');
    return { ...snapshot, stale: body.stale };
  } catch (error) {
    if (controller.signal.aborted) throw new Error('数据请求超时，请稍后重试。');
    if (error instanceof TypeError) throw new Error('暂时无法连接数据服务，请检查网络后重试。');
    throw error;
  } finally { clearTimeout(timeout); }
}
