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
  if (!t) { t = { url: '', host: '', blocked: 0, domains: new Map(), log: [], fp: new Map() }; tabs.set(tabId, t); }
  return t;
}

const emptyTotals = () => ({ blocked: 0, byCategory: {}, cookieBanners: 0, skipped: 0, fingerprinting: 0, since: Date.now(), daily: {}, topDomains: {}, siteTrackers: {} });

async function loadTotals() {
  if (totals) return totals;
  const { totals: t } = await chrome.storage.local.get('totals');
  totals = { ...emptyTotals(), ...(t || {}) };
  return totals;
}
function saveTotals() {
  clearTimeout(totalsTimer);
  totalsTimer = setTimeout(() => chrome.storage.local.set({ totals }), 3000);
}

const dayKey = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Add to today's bucket (kept 120 days) — feeds the weekly report. */
function bump(tot, field, n = 1) {
  const k = dayKey();
  const day = tot.daily[k] || (tot.daily[k] = {});
  day[field] = (day[field] || 0) + n;
  const keys = Object.keys(tot.daily);
  if (keys.length > 120) for (const old of keys.sort().slice(0, keys.length - 120)) delete tot.daily[old];
}

function remember(tot, blockedBase, siteBase) {
  tot.topDomains[blockedBase] = (tot.topDomains[blockedBase] || 0) + 1;
  if (Object.keys(tot.topDomains).length > 800) {
    tot.topDomains = Object.fromEntries(Object.entries(tot.topDomains).sort((a, b) => b[1] - a[1]).slice(0, 400));
  }
  if (siteBase && siteBase !== blockedBase) {
    const list = tot.siteTrackers[siteBase] || (tot.siteTrackers[siteBase] = []);
    if (!list.includes(blockedBase) && list.length < 60) list.push(blockedBase);
    const sites = Object.keys(tot.siteTrackers);
    if (sites.length > 3000) for (const s of sites.slice(0, 500)) delete tot.siteTrackers[s];
  }
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
    bump(tot, 'b'); bump(tot, c);
    remember(tot, base, t.host ? getBaseDomain(t.host) : null);
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
    t.url = d.url; t.host = hostnameOf(d.url); t.blocked = 0; t.domains = new Map(); t.log = []; t.fp = new Map();
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
  const fingerprinting = [...t.fp.entries()].map(([script, apis]) => ({ script, apis: [...apis] }));
  return { blocked: t.blocked, host: t.host, domains, fingerprinting };
}

export function tabLog(tabId) { return tabs.get(tabId)?.log || []; }
export function knownTabs() { return [...tabs.entries()].map(([id, t]) => ({ id, url: t.url, host: t.host, blocked: t.blocked })); }
export async function getTotals() { return loadTotals(); }
export async function countCookieBanner() { const t = await loadTotals(); t.cookieBanners++; bump(t, 'cb'); saveTotals(); }
export async function countSkipped() { const t = await loadTotals(); t.skipped++; bump(t, 'sk'); saveTotals(); }
export async function resetTotals() { totals = emptyTotals(); await chrome.storage.local.set({ totals }); }

/** A page used a fingerprinting API (reported by content/fp-detect.js). */
export async function recordFingerprint(tabId, api, script) {
  if (tabId < 0) return;
  const t = tabState(tabId);
  let host = '';
  try { host = new URL(script).hostname; } catch { host = t.host; }
  const key = host || t.host;
  const set = t.fp.get(key) || new Set();
  const isNew = !set.has(api);
  set.add(api); t.fp.set(key, set);
  if (isNew) { const tot = await loadTotals(); tot.fingerprinting++; bump(tot, 'fp'); saveTotals(); }
}

/** Known trackers per site, for search-result badges. */
export async function trackersForSites(bases) {
  const tot = await loadTotals();
  return Object.fromEntries(bases.map(b => [b, (tot.siteTrackers[b] || []).length]));
}

// Estimates used by the report (labelled as estimates in the UI)
const AVG_KB = 28, AVG_MS = 45;

export async function weeklyReport(weeksBack = 0) {
  const tot = await loadTotals();
  const days = [];
  const end = new Date(); end.setDate(end.getDate() - weeksBack * 7);
  for (let i = 6; i >= 0; i--) { const d = new Date(end); d.setDate(end.getDate() - i); days.push({ date: dayKey(d), ...(tot.daily[dayKey(d)] || {}) }); }
  const sum = f => days.reduce((n, d) => n + (d[f] || 0), 0);
  const prevDays = [];
  for (let i = 13; i >= 7; i--) { const d = new Date(end); d.setDate(end.getDate() - i); prevDays.push(tot.daily[dayKey(d)] || {}); }
  const prevBlocked = prevDays.reduce((n, d) => n + (d.b || 0), 0);
  const blocked = sum('b');
  return {
    days, blocked, prevBlocked, ads: sum('a'), trackers: sum('t'), malware: sum('m'), banners: sum('cb'), skipped: sum('sk'), fingerprinting: sum('fp'),
    savedMB: +(blocked * AVG_KB / 1024).toFixed(1), savedSeconds: Math.round(blocked * AVG_MS / 1000),
    topDomains: Object.entries(tot.topDomains).sort((a, b) => b[1] - a[1]).slice(0, 10),
    worstSites: Object.entries(tot.siteTrackers).map(([s, l]) => [s, l.length]).sort((a, b) => b[1] - a[1]).slice(0, 10),
  };
}

export function attachLogPort(port) {
  port.tabFilter = null;
  livePorts.add(port);
  port.onMessage.addListener(m => { if (m.type === 'filter') port.tabFilter = m.tabId ?? null; });
  port.onDisconnect.addListener(() => livePorts.delete(port));
}
