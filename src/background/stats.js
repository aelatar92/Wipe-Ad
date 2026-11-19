// Wipe Ad — per-tab statistics, badge, filtering log, malware warning redirect.

import { CONFIG } from '../shared/config.js';
import { hostnameOf, getBaseDomain } from '../shared/domain.js';
import { categoryOf } from './data.js';
import { actionFor } from './learning.js';

const tabs = new Map(); // tabId -> { url, host, blocked, domains: Map(base -> {count, blocked, category}), log: [] }
const livePorts = new Set();
let totals = null;
let totalsTimer = null;
let badgeOn = true;

function tabState(tabId) {
  let t = tabs.get(tabId);
  if (!t) { t = { url: '', host: '', blocked: 0, allowed3p: 0, domains: new Map(), log: [] }; tabs.set(tabId, t); }
  return t;
}

async function loadTotals() {
  if (totals) return totals;
  const { totals: t } = await chrome.storage.local.get('totals');
  totals = { blocked: 0, byCategory: {}, cookieBanners: 0, since: Date.now(), ...(t || {}) };
  return totals;
}
function saveTotals() {
  clearTimeout(totalsTimer);
  totalsTimer = setTimeout(() => chrome.storage.local.set({ totals }), 3000);
}

export function setBadgeEnabled(on) { badgeOn = on; if (!on) chrome.action.setBadgeText({ text: '' }); }

function updateBadge(tabId, t) {
  if (!badgeOn) return;
  const n = t.blocked;
  chrome.action.setBadgeText({ tabId, text: n ? (n > 999 ? '999+' : String(n)) : '' }).catch(() => {});
}

function pushLog(tabId, t, entry) {
  t.log.push(entry);
  if (t.log.length > CONFIG.LOG_LIMIT) t.log.splice(0, t.log.length - CONFIG.LOG_LIMIT);
  for (const p of livePorts) { if (p.tabFilter === null || p.tabFilter === tabId) { try { p.postMessage({ type: 'log', tabId, entry }); } catch { livePorts.delete(p); } } }
}

async function record(details, status) {
  if (details.tabId < 0) return;
  const t = tabState(details.tabId);
  const host = hostnameOf(details.url);
  const base = getBaseDomain(host);
  const category = (await categoryOf(host)) || ((await actionFor(base)) ? 't' : null);
  const thirdParty = t.host && getBaseDomain(t.host) !== base;
  if (status === 'blocked') {
    t.blocked++;
    const tot = await loadTotals();
    tot.blocked++;
    const c = category || 'o';
    tot.byCategory[c] = (tot.byCategory[c] || 0) + 1;
    saveTotals();
    updateBadge(details.tabId, t);
  }
  if (status === 'blocked' || thirdParty) {
    const d = t.domains.get(base) || { count: 0, blocked: 0, category, hosts: new Set() };
    d.count++; if (status === 'blocked') d.blocked++; d.hosts.add(host); d.category ||= category;
    t.domains.set(base, d);
  }
  pushLog(details.tabId, t, { time: Date.now(), url: details.url, type: details.type, status, category, thirdParty: !!thirdParty, method: details.method });
}

function isBlockedError(e) {
  return e === 'net::ERR_BLOCKED_BY_CLIENT' || e === 'NS_ERROR_ABORT' || /blocked/i.test(e || '');
}

export function startStats() {
  const filter = { urls: ['http://*/*', 'https://*/*', 'ws://*/*', 'wss://*/*'] };
  chrome.webRequest.onErrorOccurred.addListener(d => {
    if (isBlockedError(d.error)) record(d, 'blocked');
  }, filter);
  chrome.webRequest.onBeforeRedirect.addListener(d => {
    if (d.redirectUrl?.startsWith(chrome.runtime.getURL(''))) record(d, 'redirected');
    else if (d.type === 'main_frame' && d.statusCode === 307 && d.redirectUrl && new URL(d.redirectUrl).search.length < new URL(d.url).search.length) record(d, 'cleaned');
  }, filter);
  chrome.webRequest.onCompleted.addListener(d => { if (d.type !== 'main_frame') record(d, 'allowed'); }, filter);

  chrome.webNavigation.onCommitted.addListener(d => {
    if (d.frameId !== 0) return;
    const t = tabState(d.tabId);
    t.url = d.url; t.host = hostnameOf(d.url); t.blocked = 0; t.domains = new Map(); t.log = [];
    updateBadge(d.tabId, t);
  });
  chrome.tabs.onRemoved.addListener(id => tabs.delete(id));
}

export function onMainFrameBlocked(handler) {
  chrome.webNavigation.onErrorOccurred.addListener(d => {
    if (d.frameId === 0 && isBlockedError(d.error)) handler(d);
  });
}

export async function tabSummary(tabId) {
  const t = tabs.get(tabId);
  if (!t) return { blocked: 0, domains: [] };
  const domains = [...t.domains.entries()].map(([base, d]) => ({ base, count: d.count, blocked: d.blocked, category: d.category, hosts: [...d.hosts] }));
  domains.sort((a, b) => b.blocked - a.blocked || b.count - a.count);
  return { blocked: t.blocked, host: t.host, domains };
}

export function tabLog(tabId) { return tabs.get(tabId)?.log || []; }
export function knownTabs() { return [...tabs.entries()].map(([id, t]) => ({ id, url: t.url, host: t.host, blocked: t.blocked })); }
export async function getTotals() { return loadTotals(); }
export async function countCookieBanner() { const t = await loadTotals(); t.cookieBanners++; saveTotals(); }
export async function resetTotals() { totals = { blocked: 0, byCategory: {}, cookieBanners: 0, since: Date.now() }; await chrome.storage.local.set({ totals }); }

export function attachLogPort(port) {
  port.tabFilter = null;
  livePorts.add(port);
  port.onMessage.addListener(m => { if (m.type === 'filter') port.tabFilter = m.tabId ?? null; });
  port.onDisconnect.addListener(() => livePorts.delete(port));
}
