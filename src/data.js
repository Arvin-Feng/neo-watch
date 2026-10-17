export const LUNAR_DISTANCE_KM = 384_400;

export function shanghaiDate(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map(p => [p.type, p.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function shanghaiWindow(date) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('查询日期格式无效。');
  const start = Date.parse(`${date}T00:00:00+08:00`);
  if (!Number.isFinite(start) || shanghaiDate(new Date(start)) !== date) throw new Error('查询日期无效。');
  const end = start + 86_400_000;
  return { start, end, startUTC: new Date(start).toISOString().slice(0, 10), endUTC: new Date(end - 1).toISOString().slice(0, 10) };
}

export function finiteNumber(value) {
  if (value === null || value === undefined || (typeof value === 'string' && !value.trim()) || typeof value === 'boolean') return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

// Merge only exact official designations: never use fuzzy name or similar-distance matching.
export function objectIdentity(raw) {
  const name = String(raw.name || '').trim();
  const provisional = name.match(/\(?\b((?:18|19|20|21)\d{2})\s+([A-Z]{2}\d*)\)?\s*$/);
  const numbered = name.match(/^\(?([1-9]\d*)\s*(?:\(|[A-Za-z]|\)?$)/);
  if (provisional) {
    const designation = `${provisional[1]} ${provisional[2]}`;
    return { key: `designation:${designation}`, designation, numbered: /^\d+\s+.*\(/.test(name) };
  }
  if (numbered) return { key: `number:${numbered[1]}`, designation: numbered[1], numbered: true };
  return { key: String(raw.id), designation: null, numbered: false };
}

export function normalizeFeed(feed, date) {
  const map = feed?.near_earth_objects;
  if (!map || typeof map !== 'object' || Array.isArray(map) || Object.values(map).some(value => !Array.isArray(value))) {
    throw new Error('NASA 返回的数据格式不完整，请稍后重试。');
  }
  const { start, end } = shanghaiWindow(date);
  const groups = new Map();
  for (const raw of Object.values(map).flat()) {
    if (!raw?.id) continue;
    const identity = objectIdentity(raw);
    const approaches = (Array.isArray(raw.close_approach_data) ? raw.close_approach_data : []).filter(a => {
      const at = finiteNumber(a?.epoch_date_close_approach);
      return a?.orbiting_body === 'Earth' && at !== null && at >= start && at < end;
    });
    if (!approaches.length) continue;
    for (const a of approaches) {
      const ld = finiteNumber(a.miss_distance?.lunar);
      const km = finiteNumber(a.miss_distance?.kilometers);
      const candidate = {
        id: identity.key, name: String(raw.name || '未命名目标'), designation: identity.designation,
        hazardous: raw.is_potentially_hazardous_asteroid === true,
        diameterMin: finiteNumber(raw.estimated_diameter?.meters?.estimated_diameter_min),
        diameterMax: finiteNumber(raw.estimated_diameter?.meters?.estimated_diameter_max),
        velocity: finiteNumber(a.relative_velocity?.kilometers_per_second),
        distanceLD: ld ?? (km === null ? null : km / LUNAR_DISTANCE_KM),
        distanceKm: km ?? (ld === null ? null : ld * LUNAR_DISTANCE_KM),
        approachAt: finiteNumber(a.epoch_date_close_approach), approachDate: date,
        jplUrl: `https://ssd.jpl.nasa.gov/tools/sbdb_lookup.html#/?sstr=${encodeURIComponent(identity.designation || raw.id)}`,
        sourceIds: [String(raw.id)], sourceNames: [String(raw.name || '')],
        numbered: identity.numbered,
      };
      const old = groups.get(identity.key);
      if (!old) { groups.set(identity.key, candidate); continue; }
      const sourceIds = [...new Set([...old.sourceIds, String(raw.id)])];
      const sourceNames = [...new Set([...old.sourceNames, String(raw.name || '')])];
      const candidateDistance = candidate.distanceKm ?? Infinity;
      const oldDistance = old.distanceKm ?? Infinity;
      const preferCandidate = candidateDistance < oldDistance || (candidateDistance === oldDistance && candidate.numbered && !old.numbered);
      const selected = preferCandidate ? candidate : old;
      const preferredName = candidate.numbered && !old.numbered ? candidate.name : old.name;
      const hazardous = candidate.numbered && !old.numbered ? candidate.hazardous : old.numbered ? old.hazardous : selected.hazardous;
      groups.set(identity.key, { ...selected, name: preferredName, numbered: old.numbered || candidate.numbered,
        hazardous, sourceIds, sourceNames });
    }
  }
  return [...groups.values()].map(({ numbered, ...item }) => item)
    .sort((a, b) => (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity) || a.approachAt - b.approachAt);
}

export function mapDistances(items) {
  const values = items.filter(d => d.distanceKm !== null && Number.isFinite(d.distanceKm) && d.distanceKm >= 0)
    .map(d => Math.log1p(d.distanceKm));
  const min = values.length ? Math.min(...values) : 0;
  const max = values.length ? Math.max(...values) : 0;
  return items.map(item => {
    const valid = item.distanceKm !== null && Number.isFinite(item.distanceKm) && item.distanceKm >= 0;
    const t = !valid || max === min ? 0.5 : (Math.log1p(item.distanceKm) - min) / (max - min);
    return { ...item, radius: 1.2 + 1.8 * Math.max(0, Math.min(1, t)), distanceMapped: valid };
  });
}

export function approachStatus(epoch, now = Date.now()) {
  if (!Number.isFinite(epoch)) return { label: '时间暂无数据', upcoming: false };
  const delta = epoch - now;
  if (delta <= 0) return { label: '已飞掠', upcoming: false };
  const minutes = Math.max(1, Math.ceil(delta / 60_000));
  const hours = Math.floor(minutes / 60);
  return { label: `即将飞掠 · ${hours ? `${hours}小时` : ''}${minutes % 60 ? `${minutes % 60}分钟` : ''}后`, upcoming: true };
}

export function formatApproach(epoch, timeZone = 'Asia/Shanghai') {
  if (!Number.isFinite(epoch)) return '暂无数据';
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date(epoch)).map(p => [p.type, p.value]));
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}`;
}

export function hashId(id) {
  let hash = 2166136261;
  for (const char of String(id)) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return hash >>> 0;
}

export async function fetchTodayFeed({ date, apiKey = 'DEMO_KEY', timeoutMs = 15_000, fetchImpl = fetch }) {
  const window = shanghaiWindow(date);
  const url = new URL('https://api.nasa.gov/neo/rest/v1/feed');
  url.search = new URLSearchParams({ start_date: window.startUTC, end_date: window.endUTC, api_key: apiKey }).toString();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, { signal: controller.signal });
    if (!response.ok) {
      if (response.status === 429) throw new Error('NASA 请求额度已用完，请稍后重试或进入演示。');
      if (response.status === 403 || response.status === 401) throw new Error('NASA API Key 无效或暂时受限，请检查配置。');
      throw new Error(`NASA 服务暂时不可用（${response.status}），请稍后重试。`);
    }
    return normalizeFeed(await response.json(), date);
  } catch (error) {
    if (controller.signal.aborted) throw new Error(`NASA 请求超过 ${Math.round(timeoutMs / 1000)} 秒，请检查网络后重试。`);
    if (error instanceof TypeError) throw new Error('暂时无法连接 NASA，请检查网络后重试。');
    throw error;
  } finally { clearTimeout(timeout); }
}

export function demoItems(date) {
  const names = ['2026 TU4', '2026 TC', '2026 TA8', '2026 TG2', '2026 TH7', '2026 TJ1', '2026 TK6', '2026 TL9', '2026 TM3', '2026 TN5', '2026 TP1', '2026 TQ7'];
  const distances = [2.84, 4.12, 6.21, 8.33, 10.24, 12.11, 18.42, 21.36, 28.17, 32.03, 41.26, 54.18];
  const start = shanghaiWindow(date).start;
  return names.map((name, i) => ({ id: `demo-${i}`, name, designation: name, hazardous: i < 2,
    diameterMin: i === 0 ? 82 : 18 + i * 13, diameterMax: i === 0 ? 184 : 42 + i * 27,
    velocity: i === 0 ? 12.76 : 8.5 + i * 1.34, distanceLD: distances[i],
    distanceKm: distances[i] * LUNAR_DISTANCE_KM, approachDate: date,
    approachAt: start + (i * 2 + .5) * 3_600_000, sourceIds: [], sourceNames: [], jplUrl: null,
  }));
}
