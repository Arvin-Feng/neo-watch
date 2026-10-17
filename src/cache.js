import { shanghaiWindow } from './data.js';
const KEY = 'neo-observatory:feed:v2';
const FIELDS = ['id', 'name', 'designation', 'hazardous', 'diameterMin', 'diameterMax', 'velocity',
  'distanceLD', 'distanceKm', 'approachAt', 'approachDate', 'jplUrl', 'sourceIds', 'sourceNames'];
const NUMBERS = ['diameterMin', 'diameterMax', 'velocity', 'distanceLD', 'distanceKm'];
export function saveFeedCache(storage, { date, items, fetchedAt }) {
  try {
    const cleanItems = items.map(item => Object.fromEntries(FIELDS.map(key => [key, item[key]])));
    storage.setItem(KEY, JSON.stringify({ version: 2, date, fetchedAt, items: cleanItems }));
    return true;
  } catch { return false; }
}
export function readFeedCache(storage, date) {
  try {
    const data = JSON.parse(storage.getItem(KEY));
    const { start, end } = shanghaiWindow(date);
    if (!data || data.version !== 2 || data.date !== date || !Number.isFinite(Date.parse(data.fetchedAt)) || !Array.isArray(data.items)) return null;
    const valid = data.items.every(item => typeof item.id === 'string' && typeof item.name === 'string'
      && typeof item.hazardous === 'boolean' && item.approachDate === date
      && Number.isFinite(item.approachAt) && item.approachAt >= start && item.approachAt < end
      && NUMBERS.every(key => item[key] === null || (Number.isFinite(item[key]) && item[key] >= 0))
      && Array.isArray(item.sourceIds) && item.sourceIds.every(id => typeof id === 'string')
      && Array.isArray(item.sourceNames) && item.sourceNames.every(name => typeof name === 'string')
      && (item.jplUrl === null || /^https:\/\/ssd\.jpl\.nasa\.gov\/tools\/sbdb_lookup\.html#\//.test(item.jplUrl)));
    return valid ? { version: 2, date: data.date, fetchedAt: data.fetchedAt,
      items: data.items.map(item => Object.fromEntries(FIELDS.map(key => [key, item[key]]))) } : null;
  } catch { return null; }
}
