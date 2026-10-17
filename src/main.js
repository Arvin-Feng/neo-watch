import './styles.css';
import { config } from './config.js';
import { shanghaiDate, fetchTodayFeed, demoItems, mapDistances, approachStatus, formatApproach } from './data.js';
import { readFeedCache, saveFeedCache } from './cache.js';
import { fetchFeedSnapshot } from './feed.js';

const $ = id => document.getElementById(id);
const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
const state = { date: shanghaiDate(), dataDate: null, items: [], mode: 'live', loaded: false,
  loading: false, error: null, updated: null, selected: null, hazardOnly: false, paused: motion.matches, cached: false };
let scene = null;
let lastSelectedButton = null;
const format = (number, decimals = 2) => number === null ? '暂无数据' :
  new Intl.NumberFormat('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(number);
const visibleItems = () => state.items.filter(item => !state.hazardOnly || item.hazardous);
const helpDescriptions = {
  today: ['今日目标如何统计', '今日按北京时间 00:00 至次日 00:00 统计，以飞掠时刻为准。\n接口请求会覆盖相邻两个 UTC 日期；相同完整临时编号或正式编号的新旧记录会合并为一个目标。无法确认时间的记录不计入。', 'https://api.nasa.gov/#NeoWS'],
  hazard: ['什么是潜在危险小行星', '这是 NASA 的天体分类，综合考虑轨道与地球轨道的接近程度和天体大小，用于筛选需要持续监测的对象。\n它不代表本次会撞击地球，也不等同于撞击概率。', 'https://cneos.jpl.nasa.gov/about/neo_groups.html'],
  time: ['最近接近时刻', '这是本次飞掠预计距离地球最近的时刻。界面同时显示北京时间（UTC+8）和 UTC，并按当前时间标记“即将飞掠”或“已飞掠”。\n画面中的旋转动画没有实时追踪天体的位置。', 'https://cneos.jpl.nasa.gov/ca/'],
  diameter: ['为什么直径是一个范围', '很多小行星的大小需要根据亮度及假设的表面反射能力估算。这里给出米制的等效直径范围，并非精确测量或统计置信区间。\n发光点的显示大小用于便于点击，不代表真实直径。', 'https://cneos.jpl.nasa.gov/tools/ast_size_est.html'],
  velocity: ['相对飞掠速度', '这是小行星最接近地球时相对于地球的速度，单位 km/s（公里／秒）。\n例如 10 km/s 等于每小时 36,000 公里。画面动画速度与这个数值无关。', 'https://cneos.jpl.nasa.gov/ca/'],
  distance: ['月球距离 LD 与最近距离', '1 LD 约为 384,400 公里，是地球与月球的平均距离。这里显示本次飞掠的最近地心距离，并同时换算为公里。\n距离参考环使用对数缩放，方向为示意；不同日期的图形位置不能用于直接比较距离，请查看数值。', 'https://cneos.jpl.nasa.gov/glossary/LD.html'],
};

function targetSubtitle(item) {
  const time = formatApproach(item.approachAt).slice(11);
  return `${item.hazardous ? '潜在危险' : '普通目标'} · ${approachStatus(item.approachAt).upcoming ? '待飞掠' : '已飞掠'} ${time}`;
}

function updateApproachDetails(item) {
  const status = approachStatus(item.approachAt);
  $('approach-status').textContent = status.label;
  $('approach-status').classList.toggle('upcoming', status.upcoming);
  $('detail-approach').textContent = formatApproach(item.approachAt);
  $('detail-approach').dateTime = Number.isFinite(item.approachAt) ? new Date(item.approachAt).toISOString() : '';
  $('detail-utc').textContent = `${formatApproach(item.approachAt, 'UTC')} UTC`;
}

function updateClocks() {
  for (const row of $('target-list').querySelectorAll('button[data-id]')) {
    const item = state.items.find(item => item.id === row.dataset.id);
    if (item) {
      row.querySelector('.target-type').textContent = targetSubtitle(item);
      row.querySelector('.target-type').classList.toggle('upcoming', approachStatus(item.approachAt).upcoming);
      row.setAttribute('aria-label', `${item.name}，${targetSubtitle(item)} 北京时间，${item.distanceLD === null ? '距离暂无数据' : `${format(item.distanceLD)} LD`}`);
    }
  }
  const selected = state.items.find(item => item.id === state.selected);
  if (selected) updateApproachDetails(selected);
}

function statusMessage(text, actions = false) {
  const host = $('feed-status');
  host.classList.toggle('demo', state.mode === 'demo' && !state.error && !state.loading);
  host.replaceChildren();
  if (!text) return;
  const p = document.createElement('p'); p.textContent = text; host.append(p);
  if (actions) {
    const row = document.createElement('div'); row.className = 'status-actions';
    for (const [label, handler] of [['重试', loadLive], ['进入演示', enterDemo]]) {
      const button = document.createElement('button'); button.textContent = label;
      button.disabled = state.loading; button.addEventListener('click', handler); row.append(button);
    }
    host.append(row);
  }
}

function renderList() {
  const list = $('target-list');
  list.replaceChildren(); list.setAttribute('aria-busy', String(state.loading));
  const items = visibleItems();
  if (!items.length && state.loaded) {
    const p = document.createElement('p'); p.className = 'empty-message';
    p.textContent = state.hazardOnly ? '今日没有标记为潜在危险的目标。' : '今日没有接近地球的小行星记录。';
    list.append(p);
  }
  for (const item of items) {
    const row = document.createElement('button');
    row.className = `target-row${item.hazardous ? ' hazard' : ''}${item.id === state.selected ? ' selected' : ''}`;
    row.dataset.id = item.id;
    row.setAttribute('aria-pressed', String(item.id === state.selected));
    row.setAttribute('aria-label', `${item.name}，${targetSubtitle(item)} 北京时间，${item.distanceLD === null ? '距离暂无数据' : `${format(item.distanceLD)} LD`}`);
    const dot = document.createElement('i'); dot.className = `ph-fill ph-circle dot ${item.hazardous ? 'red' : 'cyan'}`; dot.setAttribute('aria-hidden', 'true');
    const text = document.createElement('span');
    const name = document.createElement('span'); name.className = 'target-name'; name.textContent = item.name;
    const type = document.createElement('span'); type.className = `target-type${approachStatus(item.approachAt).upcoming ? ' upcoming' : ''}`; type.textContent = targetSubtitle(item);
    text.append(name, type);
    const distance = document.createElement('span'); distance.className = 'distance numeric'; distance.textContent = item.distanceLD === null ? '暂无数据' : `${format(item.distanceLD)} LD`;
    const arrow = document.createElement('i'); arrow.className = 'ph ph-caret-right chevron'; arrow.setAttribute('aria-hidden', 'true');
    row.append(dot, text, distance, arrow);
    row.addEventListener('click', () => selectItem(item.id, row));
    list.append(row);
  }
  $('list-count').textContent = state.loaded ? `共 ${items.length} 个` : '等待数据';
}

function render() {
  const hazards = state.items.filter(item => item.hazardous).length;
  $('query-date').textContent = state.date;
  $('query-date').dateTime = state.date;
  const historical = state.loaded && state.dataDate !== state.date;
  $('count-label').textContent = historical ? '历史目标' : '今日目标';
  document.querySelector('.panel-heading h2').textContent = historical ? `${state.dataDate} 飞掠目标` : '今日飞掠目标';
  $('mobile-list-toggle').querySelector('span').textContent = historical ? '历史目标' : '今日目标';
  document.querySelector('.scene-caption > span:last-child').textContent = historical ? `${state.dataDate} 飞掠 · 距离示意` : '今日飞掠 · 距离示意';
  $('total-count').textContent = state.loaded ? state.items.length : '—';
  $('hazard-count').textContent = state.loaded ? hazards : '—';
  $('mobile-count').textContent = state.loaded ? state.items.length : '—';
  $('all-filter-count').textContent = state.loaded ? `(${state.items.length})` : '';
  $('hazard-filter-count').textContent = state.loaded ? `(${hazards})` : '';
  $('refresh').disabled = state.loading;
  $('refresh').querySelector('span').textContent = state.loading ? '获取中' : '刷新';
  $('demo-entry').disabled = state.loading;
  $('demo-entry').hidden = state.mode === 'demo';
  $('back-live').hidden = state.mode !== 'demo';
  $('back-live').disabled = state.loading;
  const badge = $('source-badge');
  badge.className = `source-badge${state.mode === 'demo' ? ' demo' : (state.error && state.loaded) || state.cached ? ' stale' : ''}`;
  badge.textContent = state.mode === 'demo' ? '演示数据' : state.cached === 'server' ? '服务器缓存' : state.cached ? '本地缓存' : state.error && state.loaded ? '数据未更新' : state.loading ? '连接 NASA' : state.loaded ? 'NASA NeoWs' : '连接失败';
  $('updated-at').textContent = state.updated ? `${state.cached ? '缓存获取于' : '获取于'} ${formatApproach(state.updated.getTime())}` : '尚未获取数据';
  if (state.error) statusMessage(`${state.error}${state.loaded ? ` 当前保留 ${state.dataDate} 的${state.mode === 'demo' ? '演示' : '上次成功'}数据。` : ''}`, true);
  else if (state.loading) statusMessage(state.loaded ? '正在刷新，当前显示上次获取的数据。' : '正在接收 NASA 今日飞掠数据…');
  else if (state.mode === 'demo') statusMessage('演示模式 · 以下为虚构目标数据');
  else if (state.cached === 'server') statusMessage('NASA 暂时无法更新，当前显示服务器保存的当日数据，时间戳为上次成功获取时间。');
  else if (state.cached) statusMessage('当前显示本机保存的 NASA 数据，时间戳为上次成功获取时间。');
  else statusMessage('');
  renderList();
}

async function loadLive() {
  if (state.loading) return;
  state.loading = true; state.error = null; state.date = shanghaiDate();
  const requestDate = state.date;
  render();
  try {
    const snapshot = import.meta.env.PROD
      ? await fetchFeedSnapshot({ date: requestDate, endpoint: config.feedEndpoint, timeoutMs: config.requestTimeoutMs })
      : { items: await fetchTodayFeed({ date: requestDate, apiKey: config.apiKey, timeoutMs: config.requestTimeoutMs }), fetchedAt: new Date().toISOString(), date: requestDate, stale: false };
    const { items } = snapshot;
    state.items = mapDistances(items); state.mode = 'live'; state.loaded = true; state.cached = snapshot.stale ? 'server' : false;
    state.updated = new Date(snapshot.fetchedAt); state.dataDate = snapshot.date;
    try { saveFeedCache(window.localStorage, { date: requestDate, items, fetchedAt: state.updated.toISOString() }); } catch { /* Browsing can continue without storage. */ }
    closeDetails(false); scene?.setData(visibleItems());
  } catch (error) { state.error = error.message || '数据获取失败，请稍后重试。'; }
  finally { state.loading = false; render(); }
}

function enterDemo() {
  if (state.loading) return;
  state.mode = 'demo'; state.cached = false; state.error = null; state.date = shanghaiDate(); state.dataDate = state.date;
  state.items = mapDistances(demoItems(state.date)); state.loaded = true; state.updated = new Date();
  closeDetails(false); scene?.setData(visibleItems()); render();
}

function setPaused(value) {
  state.paused = value; scene?.setPaused(value);
  const button = $('rotation-toggle'); button.setAttribute('aria-pressed', String(value));
  button.querySelector('i').className = `ph ph-${value ? 'play-circle' : 'pause-circle'}`;
  button.querySelector('span').textContent = value ? '继续旋转' : '暂停旋转';
}

function selectItem(id, originButton = null) {
  const item = state.items.find(item => item.id === id);
  if (!item) return;
  lastSelectedButton = originButton;
  state.selected = id; setPaused(true); scene?.select(id);
  $('details').hidden = false;
  $('detail-name').textContent = item.name;
  const classification = $('detail-class'); classification.textContent = item.hazardous ? '潜在危险' : '普通目标';
  classification.className = `classification${item.hazardous ? ' hazard' : ''}`;
  updateApproachDetails(item);
  const validDiameter = item.diameterMin !== null && item.diameterMax !== null;
  $('detail-diameter').textContent = validDiameter ? `${format(item.diameterMin, 0)}–${format(item.diameterMax, 0)}` : '暂无数据';
  $('diameter-unit').hidden = !validDiameter;
  $('detail-velocity').textContent = format(item.velocity); $('velocity-unit').hidden = item.velocity === null;
  $('detail-distance').textContent = format(item.distanceLD); $('distance-unit').hidden = item.distanceLD === null;
  $('detail-kilometers').textContent = item.distanceKm === null ? '公里距离暂无数据' : `≈ ${format(item.distanceKm, 0)} km`;
  $('jpl-source').hidden = state.mode === 'demo' || !item.jplUrl;
  if (item.jplUrl) $('jpl-source').href = item.jplUrl; else $('jpl-source').removeAttribute('href');
  $('identity-note').textContent = state.mode === 'demo' ? '虚构演示目标，时间和数值均为演示。' : `${item.designation ? `统一识别：${item.designation}。` : ''}${item.sourceIds.length > 1 ? `已合并 ${item.sourceIds.length} 条编号记录，按同一天体计数。` : '来源：NASA NeoWs 飞掠记录。'}`;
  document.querySelectorAll('.demo-label').forEach(label => { label.hidden = state.mode !== 'demo'; });
  $('detail-note').querySelector('span').textContent = item.hazardous ? '潜在危险分类不代表本次会撞击地球。' : '青色表示未被 NASA 标记为潜在危险的目标。';
  renderList();
  $('target-panel').classList.remove('mobile-open'); $('mobile-list-toggle').setAttribute('aria-expanded', 'false');
  if (originButton) $('close-details').focus({ preventScroll: true });
}

function closeDetails(restoreFocus = true) {
  const selected = state.selected;
  state.selected = null; $('details').hidden = true; scene?.select(null);
  renderList();
  if (restoreFocus && lastSelectedButton) {
    const row = [...$('target-list').querySelectorAll('button')].find(row => row.dataset.id === selected);
    if (window.matchMedia('(max-width: 700px)').matches) $('mobile-list-toggle').focus(); else row?.focus();
  }
  lastSelectedButton = null;
}

function setFilter(hazardOnly) {
  state.hazardOnly = hazardOnly;
  $('filter-all').classList.toggle('active', !hazardOnly); $('filter-all').setAttribute('aria-pressed', String(!hazardOnly));
  $('filter-hazard').classList.toggle('active', hazardOnly); $('filter-hazard').setAttribute('aria-pressed', String(hazardOnly));
  if (state.selected && !visibleItems().some(item => item.id === state.selected)) closeDetails(false);
  scene?.setData(visibleItems()); scene?.select(state.selected); renderList();
}

$('refresh').addEventListener('click', loadLive);
$('back-live').addEventListener('click', loadLive);
$('demo-entry').addEventListener('click', enterDemo);
$('close-details').addEventListener('click', () => closeDetails());
$('filter-all').addEventListener('click', () => setFilter(false));
$('filter-hazard').addEventListener('click', () => setFilter(true));
$('rotation-toggle').addEventListener('click', () => setPaused(!state.paused));
$('reset-view').addEventListener('click', () => { closeDetails(false); scene?.reset(); setPaused(motion.matches); });
$('mobile-list-toggle').addEventListener('click', () => {
  if (!$('details').hidden) closeDetails(false);
  const open = $('target-panel').classList.toggle('mobile-open');
  $('mobile-list-toggle').setAttribute('aria-expanded', String(open));
});
document.addEventListener('keydown', event => { if (event.key === 'Escape') {
  if ($('metric-help').open) return;
  if (!$('details').hidden) closeDetails();
  $('target-panel').classList.remove('mobile-open'); $('mobile-list-toggle').setAttribute('aria-expanded', 'false');
} });
motion.addEventListener('change', event => { if (event.matches) setPaused(true); });
document.querySelectorAll('[data-help]').forEach(button => button.addEventListener('click', () => {
  const [title, copy, url] = helpDescriptions[button.dataset.help];
  $('help-title').textContent = title; $('help-copy').textContent = copy; $('help-source').href = url;
  $('metric-help').showModal();
}));
$('close-help').addEventListener('click', () => $('metric-help').close());
function checkDate() { if (!document.hidden && shanghaiDate() !== state.date && !state.loading) {
  if (state.mode === 'demo') enterDemo(); else loadLive();
} }
setInterval(() => { checkDate(); if (!document.hidden) updateClocks(); }, 30_000);
document.addEventListener('visibilitychange', checkDate);

try {
  const cache = readFeedCache(window.localStorage, state.date);
  if (cache) {
    state.items = mapDistances(cache.items); state.loaded = true; state.cached = true;
    state.dataDate = cache.date; state.updated = new Date(cache.fetchedAt);
  }
} catch { /* Private storage restrictions must not block the app. */ }
render(); setPaused(state.paused);
import('./scene.js').then(({ createScene }) => createScene($('globe'), {
  reducedMotion: motion.matches,
  onSelect: id => selectItem(id),
  onReady: () => { $('scene-loading').hidden = true; },
  onNotice: text => { $('scene-notice').textContent = text; $('scene-notice').hidden = false; },
})).then(result => {
  scene = result; scene.setData(visibleItems()); scene.setPaused(state.paused);
  $('rotation-toggle').disabled = !scene.available; $('reset-view').disabled = !scene.available;
}).catch(() => {
  $('scene-loading').hidden = true; $('scene-notice').hidden = false;
  $('scene-notice').textContent = '三维视野暂不可用，目标列表与详情仍可使用。';
  $('rotation-toggle').disabled = true; $('reset-view').disabled = true;
});
loadLive();
