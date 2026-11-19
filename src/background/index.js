// Wipe Ad — background service worker (entry point)
// Listeners are registered synchronously at top level (MV3 requirement); state is (re)loaded lazily.

import { CONFIG } from '../shared/config.js';
import { hostnameOf, getBaseDomain } from '../shared/domain.js';
import { compileFilters } from '../shared/filter-parser.js';
import { getSettings, setSettings, onSettingsChanged, siteModeFor, getPaused, setPausedHost, DEFAULTS } from './settings.js';
import { ensurePSL, getCatalog, rebuildCosmetic, categoryOf } from './data.js';
import { syncStaticRulesets, applySiteRules, setPaused as setPausedRules, allowOnce, ruleCounts, enabledRulesetIds } from './rules.js';
import { applyStealth } from './stealth.js';
import { startLearning, configureLearning, applyLearnedRules, getLearningState, setUserAction, resetLearning, learnedTrackers } from './learning.js';
import { startStats, onMainFrameBlocked, tabSummary, tabLog, knownTabs, getTotals, resetTotals, attachLogPort, setBadgeEnabled, countCookieBanner } from './stats.js';
import { startCosmetic, onFrameInit, onTokens, applySelectorNow } from './cosmetic.js';
import { getUserFilters, setUserFilters, addUserFilter, getUserCosmetic, getRemoteCosmetic, refreshCustomLists, customListsStatus, clearRemote } from './filters.js';
import { ALARM, scheduleUpdates, runScheduledUpdate, checkExtensionUpdate, checkFilterUpdates, getUpdateStatus, onNotificationClicked, handleUpdateAvailable } from './updater.js';

const COOKIE_ALARM = 'wipead:cookies';
const UNPAUSE_ALARM = 'wipead:unpause';
const CUSTOM_ALARM = 'wipead:custom-lists';

// ---------------------------------------------------------------------------
// Initialisation
// ---------------------------------------------------------------------------
let readyPromise = null;
function ready() {
  if (!readyPromise) readyPromise = (async () => {
    await ensurePSL();
    const s = await getSettings();
    configureLearning(s);
    setBadgeEnabled(s.showBadge);
    await refreshCosmeticIndex(s);
  })().catch(e => { console.error('[WipeAd] init failed', e); readyPromise = null; });
  return readyPromise;
}

async function refreshCosmeticIndex(s) {
  s ||= await getSettings();
  const ids = await enabledRulesetIds(s);
  const extra = [await getRemoteCosmetic(), await getUserCosmetic()].filter(Boolean);
  await rebuildCosmetic(ids, extra);
}

async function applyAll() {
  const s = await getSettings();
  await syncStaticRulesets(s);
  await applySiteRules(s);
  await applyStealth(s);
  configureLearning(s);
  await applyLearnedRules();
  const paused = await getPaused();
  await setPausedRules(Object.keys(paused));
}

chrome.runtime.onInstalled.addListener(async ({ reason, previousVersion }) => {
  await ready();
  await applyAll();
  if (!(await getUserFilters())) await setUserFilters('');
  await scheduleUpdates();
  await chrome.alarms.create(COOKIE_ALARM, { periodInMinutes: 15 });
  await chrome.alarms.create(CUSTOM_ALARM, { periodInMinutes: 24 * 60 });
  setupContextMenus();
  if (reason === 'install') chrome.tabs.create({ url: chrome.runtime.getURL('ui/dashboard.html#welcome') });
  if (reason === 'update') {
    await chrome.storage.local.set({ justUpdated: { from: previousVersion, to: chrome.runtime.getManifest().version, at: Date.now() } });
    const { updateStatus = {} } = await chrome.storage.local.get('updateStatus');
    await chrome.storage.local.set({ updateStatus: { ...updateStatus, available: null } });
  }
  // fetch fresh delta rules shortly after install/update
  setTimeout(() => runScheduledUpdate(() => refreshCosmeticIndex(), null).catch(() => {}), 5000);
});

chrome.runtime.onStartup.addListener(async () => {
  await ready();
  await scheduleUpdates();
  const s = await getSettings();
  await setPausedRules([]); // session rules are gone anyway; keep in sync
  if (s.enabled) await syncStaticRulesets(s);
});

chrome.runtime.onUpdateAvailable?.addListener(handleUpdateAvailable);

onSettingsChanged(async (cur, prev, patch) => {
  const keys = Object.keys(patch);
  if (keys.some(k => ['enabled', 'rulesets'].includes(k))) { await syncStaticRulesets(cur); await refreshCosmeticIndex(cur); }
  if (keys.some(k => ['enabled', 'allowlist', 'siteModes'].includes(k))) await applySiteRules(cur);
  if (keys.some(k => ['enabled', 'gpc', 'removeXClientData', 'hideReferrer', 'hideSearchQueries', 'stripTrackingParams', 'blockPings', 'stripThirdPartyCookies', 'blockWebRTC'].includes(k))) await applyStealth(cur);
  if (keys.some(k => ['enabled', 'learning', 'learningThreshold'].includes(k))) { configureLearning(cur); await applyLearnedRules(); }
  if (keys.includes('showBadge')) setBadgeEnabled(cur.showBadge);
  if (keys.includes('updateIntervalMin')) await scheduleUpdates();
  if (keys.includes('customLists')) await refreshCustomLists(cur.customLists).then(() => refreshCosmeticIndex(cur));
});

// ---------------------------------------------------------------------------
// Runtime modules (must register listeners now)
// ---------------------------------------------------------------------------
startStats();
startLearning();
startCosmetic();
ready();

onMainFrameBlocked(async d => {
  const s = await getSettings();
  if (!s.malwareWarning) return;
  const cat = await categoryOf(hostnameOf(d.url));
  const page = chrome.runtime.getURL(`ui/blocked.html?url=${encodeURIComponent(d.url)}&cat=${cat || ''}`);
  chrome.tabs.update(d.tabId, { url: page }).catch(() => {});
});

// ---------------------------------------------------------------------------
// Alarms
// ---------------------------------------------------------------------------
chrome.alarms.onAlarm.addListener(async alarm => {
  await ready();
  if (alarm.name === ALARM) {
    const s = await getSettings();
    await runScheduledUpdate(() => refreshCosmeticIndex(s), await enabledRulesetIds(s));
  } else if (alarm.name === COOKIE_ALARM) {
    await deleteTrackerCookies();
  } else if (alarm.name === UNPAUSE_ALARM) {
    const paused = await getPaused();
    await chrome.storage.session.set({ paused });
    await setPausedRules(Object.keys(paused));
  } else if (alarm.name === CUSTOM_ALARM) {
    const s = await getSettings();
    if (s.customLists.length) { await refreshCustomLists(s.customLists); await refreshCosmeticIndex(s); }
  }
});

// Cookie self-destruct for known trackers (AdGuard-like)
async function deleteTrackerCookies() {
  const s = await getSettings();
  if (!s.enabled || !s.autoDeleteTrackerCookies || !chrome.cookies) return 0;
  const learned = await learnedTrackers();
  const openTabs = await chrome.tabs.query({});
  const firstParties = new Set(openTabs.map(t => getBaseDomain(hostnameOf(t.url || ''))).filter(Boolean));
  const cookies = await chrome.cookies.getAll({});
  let removed = 0;
  for (const c of cookies) {
    const host = c.domain.replace(/^\./, '');
    const base = getBaseDomain(host);
    if (firstParties.has(base)) continue;
    const cat = learned.has(base) ? 't' : await categoryOf(host);
    if (cat !== 't' && cat !== 'a') continue;
    const url = `http${c.secure ? 's' : ''}://${host}${c.path}`;
    try { await chrome.cookies.remove({ url, name: c.name, storeId: c.storeId }); removed++; } catch { /* ignore */ }
  }
  return removed;
}

// ---------------------------------------------------------------------------
// Picker / zapper, context menu, keyboard commands
// ---------------------------------------------------------------------------
async function startPicker(tabId, mode) {
  try {
    await chrome.scripting.executeScript({ target: { tabId }, func: m => { window.__wipeAdPickerMode = m; }, args: [mode] });
    await chrome.scripting.executeScript({ target: { tabId }, files: ['content/picker.js'] });
    return { ok: true };
  } catch (e) { return { ok: false, error: String(e.message || e) }; }
}

function setupContextMenus() {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({ id: 'wipead-pick', title: chrome.i18n.getMessage('menuBlockElement') || 'Block element…', contexts: ['all'], documentUrlPatterns: ['http://*/*', 'https://*/*'] });
    chrome.contextMenus.create({ id: 'wipead-zap', title: chrome.i18n.getMessage('menuZapElement') || 'Remove element temporarily', contexts: ['all'], documentUrlPatterns: ['http://*/*', 'https://*/*'] });
    chrome.contextMenus.create({ id: 'wipead-toggle', title: chrome.i18n.getMessage('menuToggleSite') || 'Disable on this site', contexts: ['all'], documentUrlPatterns: ['http://*/*', 'https://*/*'] });
  });
}

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (!tab?.id) return;
  if (info.menuItemId === 'wipead-pick') startPicker(tab.id, 'pick');
  else if (info.menuItemId === 'wipead-zap') startPicker(tab.id, 'zap');
  else if (info.menuItemId === 'wipead-toggle') toggleSite(hostnameOf(tab.url), tab.id);
});

chrome.commands?.onCommand.addListener(async (cmd, tab) => {
  tab ||= (await chrome.tabs.query({ active: true, currentWindow: true }))[0];
  if (!tab?.id) return;
  if (cmd === 'open-picker') startPicker(tab.id, 'pick');
  else if (cmd === 'open-zapper') startPicker(tab.id, 'zap');
  else if (cmd === 'toggle-site') toggleSite(hostnameOf(tab.url), tab.id);
});

chrome.notifications?.onClicked.addListener(onNotificationClicked);

async function setSiteMode(host, mode) {
  host = host.replace(/^www\./, '');
  const s = await getSettings();
  const allowlist = s.allowlist.filter(h => h !== host);
  const siteModes = { ...s.siteModes };
  delete siteModes[host];
  if (mode === 'off') allowlist.push(host);
  else if (mode !== 'standard') siteModes[host] = mode;
  await setSettings({ allowlist, siteModes });
  if (mode !== 'off') { await setPausedHost(host, 0); await setPausedRules(Object.keys(await getPaused())); }
}

async function toggleSite(host, tabId) {
  if (!host) return;
  const s = await getSettings();
  const mode = siteModeFor(s, host, await getPaused());
  await setSiteMode(host, mode === 'off' ? 'standard' : 'off');
  if (tabId) chrome.tabs.reload(tabId);
}

// tab icon reflects whether Wipe Ad is active on the site
async function refreshIcon(tabId, url) {
  const s = await getSettings();
  const off = siteModeFor(s, hostnameOf(url || ''), await getPaused()) === 'off' || !/^https?:/.test(url || '');
  const suffix = off ? '-off' : '';
  chrome.action.setIcon({ tabId, path: { 16: `/icons/icon-16${suffix}.png`, 32: `/icons/icon-32${suffix}.png` } }).catch(() => {});
}
chrome.tabs.onActivated.addListener(({ tabId }) => chrome.tabs.get(tabId).then(t => refreshIcon(tabId, t.url)).catch(() => {}));
chrome.tabs.onUpdated.addListener((tabId, info, tab) => { if (info.status === 'loading' || info.url) refreshIcon(tabId, tab.url); });

// ---------------------------------------------------------------------------
// Messaging API (content scripts + UI pages)
// ---------------------------------------------------------------------------
const handlers = {
  'frame:init': (m, s) => onFrameInit(m, s),
  'cosmetic:tokens': (m, s) => onTokens(m, s),
  'consent:handled': () => countCookieBanner().then(() => ({ ok: true })),

  async 'popup:get'({ tabId }) {
    const tab = await chrome.tabs.get(tabId).catch(() => null);
    const host = hostnameOf(tab?.url || '');
    const s = await getSettings();
    const paused = await getPaused();
    return {
      host, url: tab?.url || '', mode: siteModeFor(s, host, paused),
      explicitMode: s.siteModes[host.replace(/^www\./, '')] || null,
      pausedUntil: Object.entries(paused).find(([h]) => host === h || host.endsWith('.' + h))?.[1] || null,
      summary: await tabSummary(tabId), totals: await getTotals(), settings: s,
      update: await getUpdateStatus(), version: chrome.runtime.getManifest().version,
    };
  },
  async 'site:setMode'({ host, mode, tabId }) { await setSiteMode(host, mode); if (tabId) refreshIcon(tabId, 'https://' + host); return { ok: true }; },
  async 'site:pause'({ host, minutes, tabId }) {
    host = host.replace(/^www\./, '');
    const map = await setPausedHost(host, minutes ? Date.now() + minutes * 60000 : 0);
    await setPausedRules(Object.keys(map));
    if (minutes) await chrome.alarms.create(UNPAUSE_ALARM, { delayInMinutes: minutes + 0.1 });
    if (tabId) { refreshIcon(tabId, 'https://' + host); chrome.tabs.reload(tabId); }
    return { ok: true };
  },
  'picker:start': ({ tabId, mode }) => startPicker(tabId, mode),
  async 'picker:create'({ selector, host }, sender) {
    const h = (host || hostnameOf(sender.tab?.url || '')).replace(/^www\./, '');
    const line = `${h}##${selector}`;
    const res = await addUserFilter(line);
    await refreshCosmeticIndex();
    if (sender.tab?.id) await applySelectorNow(sender.tab.id, selector);
    return { ok: true, line, stats: res.stats };
  },

  'settings:get': () => getSettings(),
  'settings:defaults': () => DEFAULTS,
  'settings:set': ({ patch }) => setSettings(patch),

  async 'rulesets:list'() {
    const s = await getSettings();
    const cat = await getCatalog();
    const enabled = await enabledRulesetIds(s);
    return { lists: cat.map(r => ({ ...r, on: enabled.includes(r.id) })), counts: await ruleCounts(), custom: await customListsStatus() };
  },
  async 'rulesets:set'({ id, on }) {
    const s = await getSettings();
    const res = await setSettings({ rulesets: { ...(s.rulesets || {}), [id]: on } });
    return { ok: true, settings: res, counts: await ruleCounts() };
  },

  async 'userFilters:get'() { return { text: await getUserFilters() }; },
  async 'userFilters:set'({ text }) {
    const res = await setUserFilters(text);
    await refreshCosmeticIndex();
    return res;
  },
  'userFilters:test'({ text }) { return compileFilters(text, {}).stats; },

  'learning:get': () => getLearningState(),
  async 'learning:set'({ domain, action }) { await setUserAction(domain, action); return { ok: true }; },
  async 'learning:reset'() { await resetLearning(); return { ok: true }; },

  'log:tabs': () => knownTabs(),
  'log:get': ({ tabId }) => tabLog(tabId),
  'stats:totals': () => getTotals(),
  async 'stats:reset'() { await resetTotals(); return { ok: true }; },

  'update:status': () => getUpdateStatus(),
  async 'update:checkNow'() {
    const s = await getSettings();
    const ext = await checkExtensionUpdate({ manual: true });
    const filters = await checkFilterUpdates({ force: true, enabledIds: await enabledRulesetIds(s) });
    if (filters.ok) await refreshCosmeticIndex();
    return { ext, filters, status: await getUpdateStatus() };
  },
  async 'update:clearRemote'() { await clearRemote(); await refreshCosmeticIndex(); return { ok: true }; },
  'cookies:cleanNow': () => deleteTrackerCookies().then(removed => ({ removed })),

  async 'subscribe:add'({ url, title }) {
    if (!/^https:\/\//.test(url)) return { ok: false, error: 'HTTPS only' };
    const s = await getSettings();
    if (s.customLists.some(l => l.url === url)) return { ok: true, exists: true };
    await setSettings({ customLists: [...s.customLists, { url, title: title || url }] });
    return { ok: true };
  },
  async 'subscribe:remove'({ url }) {
    const s = await getSettings();
    await setSettings({ customLists: s.customLists.filter(l => l.url !== url) });
    return { ok: true };
  },

  async 'backup:export'() {
    const data = await chrome.storage.local.get(['settings', 'userFilters', 'learning']);
    return { app: 'wipe-ad', version: chrome.runtime.getManifest().version, exported: new Date().toISOString(), ...data };
  },
  async 'backup:import'({ data }) {
    if (data?.app !== 'wipe-ad') return { ok: false, error: 'Not a Wipe Ad backup' };
    if (data.learning) await chrome.storage.local.set({ learning: data.learning });
    if (data.settings) await setSettings({ ...DEFAULTS, ...data.settings });
    if (typeof data.userFilters === 'string') await setUserFilters(data.userFilters);
    await applyAll();
    await refreshCosmeticIndex();
    return { ok: true };
  },
  async 'blocked:proceed'({ url }) {
    const host = hostnameOf(url);
    if (host) await allowOnce(host);
    return { ok: true };
  },
  async 'blocked:allowSite'({ url }) {
    const host = hostnameOf(url);
    if (host) await setSiteMode(host, 'off');
    return { ok: true };
  },
  'info:config': () => ({ ...CONFIG, version: chrome.runtime.getManifest().version }),
};

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  const h = handlers[msg?.type];
  if (!h) return false;
  // content scripts may only call the content-facing handlers
  const fromExtension = sender.url?.startsWith(chrome.runtime.getURL(''));
  const contentAllowed = ['frame:init', 'cosmetic:tokens', 'consent:handled', 'picker:create', 'subscribe:add'];
  if (!fromExtension && !contentAllowed.includes(msg.type)) { sendResponse({ error: 'forbidden' }); return false; }
  if (msg.type === 'subscribe:add' && !fromExtension) {
    // a web page asked to subscribe: open the dashboard so the user confirms
    chrome.tabs.create({ url: chrome.runtime.getURL(`ui/dashboard.html#subscribe=${encodeURIComponent(msg.url)}&title=${encodeURIComponent(msg.title || '')}`) });
    sendResponse({ ok: true, pending: true });
    return false;
  }
  ready().then(() => h(msg, sender)).then(sendResponse, e => sendResponse({ error: String(e?.message || e) }));
  return true;
});

chrome.runtime.onConnect.addListener(port => {
  if (port.name === 'log' && port.sender?.url?.startsWith(chrome.runtime.getURL(''))) attachLogPort(port);
});
