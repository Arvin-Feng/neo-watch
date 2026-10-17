import test from 'node:test';
import assert from 'node:assert/strict';
import { shanghaiDate, shanghaiWindow, finiteNumber, normalizeFeed, mapDistances, fetchTodayFeed, demoItems, hashId, approachStatus, formatApproach, objectIdentity } from '../src/data.js';
import { readFeedCache, saveFeedCache } from '../src/cache.js';

const date = '2026-10-14';
const raw = (id, km, lunar = undefined) => ({ id, name: `Asteroid ${id}`, is_potentially_hazardous_asteroid: true,
  estimated_diameter: { meters: { estimated_diameter_min: '82.1', estimated_diameter_max: '184.2' } },
  close_approach_data: [{ close_approach_date: date, orbiting_body: 'Earth',
    epoch_date_close_approach: Date.parse('2026-10-14T05:49:00Z'),
    miss_distance: { kilometers: km, lunar }, relative_velocity: { kilometers_per_second: '12.76' } }],
});

test('Shanghai today changes at UTC 16:00, without UTC date drift', () => {
  assert.equal(shanghaiDate(new Date('2026-10-13T15:59:59Z')), '2026-10-13');
  assert.equal(shanghaiDate(new Date('2026-10-13T16:00:00Z')), date);
});
test('numeric fields reject missing, negative and invalid values without turning missing into zero', () => {
  for (const value of [null, undefined, '', '  ', -3, 'bad', NaN, Infinity, true]) assert.equal(finiteNumber(value), null);
  assert.equal(finiteNumber('0'), 0);
});
test('normalization selects Earth on exact date, parses units, deduplicates and sorts', () => {
  const other = raw('other', '9'); other.close_approach_data[0].orbiting_body = 'Mars';
  const previous = raw('previous', '10'); previous.close_approach_data[0].epoch_date_close_approach = Date.parse('2026-10-13T15:59:59Z');
  const feed = { near_earth_objects: { [date]: [raw('far', '768800', '2'), raw('near', '384400'), raw('near', '384400'), other, previous] } };
  const items = normalizeFeed(feed, date);
  assert.deepEqual(items.map(i => i.id), ['near', 'far']);
  assert.equal(items[0].distanceLD, 1); assert.equal(items[1].distanceLD, 2);
  assert.equal(items[0].velocity, 12.76); assert.equal(items[0].diameterMax, 184.2);
  assert.equal(items[0].hazardous, true);
});
test('empty date is valid while malformed responses are explicit failures', () => {
  assert.deepEqual(normalizeFeed({ near_earth_objects: { [date]: [] } }, date), []);
  assert.throws(() => normalizeFeed({}, date), /格式/);
});
test('missing metrics stay null and kilometer distance can be derived from LD', () => {
  const input = raw('missing', undefined, '3'); delete input.estimated_diameter;
  delete input.close_approach_data[0].relative_velocity;
  const [item] = normalizeFeed({ near_earth_objects: { [date]: [input] } }, date);
  assert.equal(item.distanceKm, 1153200); assert.equal(item.velocity, null); assert.equal(item.diameterMin, null);
});
test('log scaling is monotonic, bounded, and stable when filtering mapped data', () => {
  const result = mapDistances([1, 10, 100, 1000].map((distanceKm, i) => ({ id: i, distanceKm, hazardous: i === 2 })));
  assert.equal(result[0].radius, 1.2); assert.equal(result[3].radius, 3);
  for (let i = 1; i < result.length; i++) assert.ok(result[i].radius > result[i - 1].radius);
  assert.equal(result.filter(i => i.hazardous)[0].radius, result[2].radius);
});
test('single/equal distances use 2.1R, missing distances are not spatially plotted', () => {
  for (const items of [[{ distanceKm: 9 }], [{ distanceKm: 9 }, { distanceKm: 9 }]]) {
    for (const item of mapDistances(items)) assert.equal(item.radius, 2.1);
  }
  assert.equal(mapDistances([{ distanceKm: null }])[0].distanceMapped, false);
  assert.deepEqual(mapDistances([]), []);
});
test('request covers both UTC dates of a Shanghai day, configurable key and abort signal', async () => {
  let received;
  const result = await fetchTodayFeed({ date, apiKey: 'TEST_ONLY', fetchImpl: async (url, options) => {
    received = { url, options }; return { ok: true, json: async () => ({ near_earth_objects: { [date]: [] } }) };
  } });
  assert.deepEqual(result, []);
  assert.equal(received.url.searchParams.get('start_date'), '2026-10-13');
  assert.equal(received.url.searchParams.get('end_date'), date);
  assert.equal(received.url.searchParams.get('api_key'), 'TEST_ONLY');
  assert.ok(received.options.signal instanceof AbortSignal);
});
test('rate limit, authentication, service failure and network errors have actionable messages', async () => {
  for (const [status, pattern] of [[429, /额度/], [403, /Key/], [500, /500/]]) {
    await assert.rejects(fetchTodayFeed({ date, fetchImpl: async () => ({ ok: false, status }) }), pattern);
  }
  await assert.rejects(fetchTodayFeed({ date, fetchImpl: async () => { throw new TypeError('network'); } }), /网络/);
});
test('timeout aborts pending request and clears its lifecycle', async () => {
  await assert.rejects(fetchTodayFeed({ date, timeoutMs: 10, fetchImpl: async (_, { signal }) => new Promise((resolve, reject) => {
    signal.addEventListener('abort', () => reject(new DOMException('abort', 'AbortError')));
  }) }), /超过/);
});
test('demo contains 12 fictional targets with two hazards; position seed is deterministic', () => {
  const items = demoItems(date); assert.equal(items.length, 12); assert.equal(items.filter(i => i.hazardous).length, 2);
  assert.ok(items.every(i => i.id.startsWith('demo-') && i.approachDate === date));
  assert.equal(hashId('123'), hashId('123')); assert.notEqual(hashId('123'), hashId('456'));
});

test('Shanghai window spans previous UTC evening to current evening, including month/year boundaries', () => {
  assert.deepEqual(shanghaiWindow(date), { start: Date.parse('2026-10-13T16:00:00Z'), end: Date.parse('2026-10-14T16:00:00Z'), startUTC: '2026-10-13', endUTC: date });
  assert.equal(shanghaiWindow('2027-01-01').startUTC, '2026-12-31');
  assert.throws(() => shanghaiWindow('2026-02-31'), /无效/);
});

test('exact Shanghai midnight included, next midnight excluded, previous UTC bucket included', () => {
  const a = raw('start', 10); a.close_approach_data[0].epoch_date_close_approach = Date.parse('2026-10-13T16:00:00Z');
  a.close_approach_data[0].close_approach_date = '2026-10-13';
  const b = raw('end', 20); b.close_approach_data[0].epoch_date_close_approach = Date.parse('2026-10-14T16:00:00Z');
  const c = raw('last', 30); c.close_approach_data[0].epoch_date_close_approach = Date.parse('2026-10-14T15:59:59.999Z');
  assert.deepEqual(normalizeFeed({near_earth_objects:{'2026-10-13':[a],[date]:[b,c]}},date).map(i=>i.id), ['start','last']);
});

test('regression: 2019 SB1 at UTC 23:14 belongs to the next Shanghai day', () => {
  const a = raw('3843899', 30); a.name = '(2019 SB1)';
  a.close_approach_data[0].epoch_date_close_approach = 1792019640000;
  const feed = {near_earth_objects:{[date]:[a]}};
  assert.equal(normalizeFeed(feed,date).length,0);
  assert.equal(normalizeFeed(feed,'2026-10-15').length,1);
});

test('regression: old and numbered 2018 EH4 merge with provenance, regardless of ordering', () => {
  const old = raw('3801936', 8422204, 21.91); old.name='(2018 EH4)';
  const numbered = raw('2678976', 8422204, 21.91); numbered.name='678976 (2018 EH4)';
  for(const rows of [[old,numbered],[numbered,old]]) {
    const items=normalizeFeed({near_earth_objects:{[date]:rows}},date);
    assert.equal(items.length,1); assert.equal(items[0].name,'678976 (2018 EH4)');
    assert.equal(items[0].id,'designation:2018 EH4'); assert.equal(items[0].sourceIds.length,2);
    assert.equal(items.filter(i=>i.hazardous).length,1);
    assert.match(items[0].jplUrl,/2018%20EH4/);
  }
});

test('similar names or distances do not merge unrelated designations; missing epoch excluded', () => {
  assert.notEqual(objectIdentity({id:'a',name:'(2018 EH4)'}).key,objectIdentity({id:'b',name:'(2018 EH41)'}).key);
  assert.equal(objectIdentity({id:'a',name:'433 Eros'}).key,'number:433');
  const a=raw('a',10); delete a.close_approach_data[0].epoch_date_close_approach;
  assert.equal(normalizeFeed({near_earth_objects:{[date]:[a]}},date).length,0);
});

test('numbered source classification takes precedence over an obsolete alias flag', () => {
  const old=raw('old',100);old.name='(2018 EH4)';
  const current=raw('numbered',100);current.name='678976 (2018 EH4)';current.is_potentially_hazardous_asteroid=false;
  for(const rows of [[old,current],[current,old]]) {
    const [item]=normalizeFeed({near_earth_objects:{[date]:rows}},date);
    assert.equal(item.hazardous,false);assert.equal(item.sourceIds.length,2);
  }
});

test('numbered named objects retain the official full name; bare provisional years are not numbers', () => {
  const old=raw('old',100);old.name='(2004 MN4)';
  const current=raw('current',100);current.name='99942 Apophis (2004 MN4)';
  const [item]=normalizeFeed({near_earth_objects:{[date]:[old,current]}},date);
  assert.equal(item.name,current.name);assert.equal(item.sourceIds.length,2);
  assert.equal(objectIdentity({id:'p',name:'2004 MN4'}).numbered,false);
});

test('live status and displayed UTC/Shanghai timestamps change at flyby', () => {
  const epoch=Date.parse('2026-10-14T05:49:00Z');
  assert.equal(formatApproach(epoch), '2026-10-14 13:49');
  assert.equal(formatApproach(epoch,'UTC'), '2026-10-14 05:49');
  assert.equal(approachStatus(epoch,epoch).label,'已飞掠');
  assert.equal(approachStatus(epoch,epoch-61*60000).label,'即将飞掠 · 1小时1分钟后');
  assert.equal(approachStatus(null).label,'时间暂无数据');
});

function fakeStorage() {
  const data=new Map(); return {getItem:key=>data.get(key)??null,setItem:(key,value)=>data.set(key,value)};
}
test('cache persists original fetch time and public fields only, excluding keys and circular Three objects', () => {
  const storage=fakeStorage(); const fetchedAt='2026-10-14T06:00:00Z';
  const items=normalizeFeed({near_earth_objects:{[date]:[raw('near',384400)]}},date);
  items[0].__threeObjCustom={}; items[0].__threeObjCustom.circular=items[0]; items[0].apiKey='NOT_FOR_CACHE';
  assert.equal(saveFeedCache(storage,{date,items,fetchedAt}),true);
  const cached=readFeedCache(storage,date);
  assert.equal(cached.fetchedAt,fetchedAt); assert.equal(cached.items.length,1);
  assert.equal(cached.items[0].apiKey,undefined); assert.equal(cached.items[0].__threeObjCustom,undefined);
  assert.equal(readFeedCache(storage,'2026-10-15'),null);
});
test('corrupt, incompatible and inaccessible cache do not block live loading', () => {
  assert.equal(readFeedCache({getItem:()=>'{bad json'},date),null);
  assert.equal(readFeedCache({getItem:()=>JSON.stringify({version:1,date,items:[]})},date),null);
  const restricted={getItem:()=>{throw new Error('denied')},setItem:()=>{throw new Error('full')}};
  assert.equal(readFeedCache(restricted,date),null);
  assert.equal(saveFeedCache(restricted,{date,items:[],fetchedAt:'2026-10-14T06:00:00Z'}),false);
});
test('empty successful results are cacheable with their original date', () => {
  const storage=fakeStorage();saveFeedCache(storage,{date,items:[],fetchedAt:'2026-10-14T06:00:00Z'});
  assert.deepEqual(readFeedCache(storage,date).items,[]);
});
