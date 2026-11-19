// Wipe Ad — user filters ("My filters") and remote filter updates (delta lists)

import { RULE_IDS } from '../shared/config.js';
import { compileFilters, emptyCosmetic } from '../shared/filter-parser.js';
import { replaceDynamicRange } from './rules.js';

async function maxDynamic() {
  const DNR = chrome.declarativeNetRequest;
  return DNR.MAX_NUMBER_OF_DYNAMIC_RULES || DNR.MAX_NUMBER_OF_DYNAMIC_AND_SESSION_RULES || 5000;
}

// Regex rules must be validated by the browser before being added dynamically
async function validateRules(rules) {
  const out = [];
  for (const r of rules) {
    if (r.condition.regexFilter && chrome.declarativeNetRequest.isRegexSupported) {
      try {
        const res = await chrome.declarativeNetRequest.isRegexSupported({ regex: r.condition.regexFilter, isCaseSensitive: !!r.condition.isUrlFilterCaseSensitive });
        if (!res.isSupported) continue;
      } catch { continue; }
    }
    out.push(r);
  }
  return out;
}

// ---------------------------------------------------------------------------
// User filters
// ---------------------------------------------------------------------------
export async function getUserFilters() {
  const { userFilters = '' } = await chrome.storage.local.get('userFilters');
  return userFilters;
}

export async function getUserCosmetic() {
  const { userCosmetic } = await chrome.storage.local.get('userCosmetic');
  return userCosmetic || null;
}

export async function setUserFilters(text, enabled = true) {
  await chrome.storage.local.set({ userFilters: text });
  const { customListsCache = {} } = await chrome.storage.local.get('customListsCache');
  const compiled = compileFilters([text, ...Object.values(customListsCache).map(c => c.text || '')].join('\n'), { maxRegex: 200 });
  const rules = enabled ? await validateRules(compiled.rules) : [];
  const res = await replaceDynamicRange(RULE_IDS.USER_START, RULE_IDS.USER_END, rules);
  const cos = { ...(enabled ? compiled.cosmetic : emptyCosmetic()), __v: Date.now() };
  await chrome.storage.local.set({ userCosmetic: cos });
  return { stats: compiled.stats, applied: res };
}

export async function addUserFilter(line) {
  const cur = await getUserFilters();
  const lines = cur.split('\n').map(s => s.trim()).filter(Boolean);
  if (!lines.includes(line)) lines.push(line);
  return setUserFilters(lines.join('\n'));
}

// ---------------------------------------------------------------------------
// Remote delta lists (auto-updating rules without publishing a new version)
// ---------------------------------------------------------------------------
async function sha256(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function getRemoteCosmetic() {
  const { remoteCosmetic } = await chrome.storage.local.get('remoteCosmetic');
  return remoteCosmetic || null;
}

/**
 * manifest = { version, generated, lists: [{ id, url, sha256 }], yellowlist?, consentRules?, notice? }
 * Each list is filter text (ABP syntax). They are compiled locally into dynamic rules + cosmetic data.
 */
export async function applyRemoteManifest(manifest, baseUrl, enabledIds = null) {
  const texts = [];
  const meta = [];
  for (const l of manifest.lists || []) {
    if (enabledIds && l.ruleset && !enabledIds.includes(l.ruleset)) continue;
    const u = new URL(l.url, baseUrl + '/').href;
    const r = await fetch(u, { cache: 'no-store' });
    if (!r.ok) throw new Error(`HTTP ${r.status} for ${u}`);
    const text = await r.text();
    if (l.sha256 && (await sha256(text)) !== l.sha256) throw new Error(`Checksum mismatch for ${l.id}`);
    texts.push(text);
    meta.push({ id: l.id, lines: text.split('\n').length });
  }
  const compiled = compileFilters(texts.join('\n'), { maxRegex: 500 });
  const budget = Math.min(RULE_IDS.REMOTE_END - RULE_IDS.REMOTE_START + 1, (await maxDynamic()) - 2000);
  const rules = (await validateRules(compiled.rules)).slice(0, Math.max(0, budget));
  const res = await replaceDynamicRange(RULE_IDS.REMOTE_START, RULE_IDS.REMOTE_END, rules);
  await chrome.storage.local.set({
    remoteCosmetic: { ...compiled.cosmetic, __v: Date.now() },
    remoteState: { version: manifest.version, generated: manifest.generated, appliedAt: Date.now(), lists: meta, stats: compiled.stats, applied: res },
    remoteExtras: { yellowlist: manifest.yellowlist || [], consentRules: manifest.consentRules || [], notice: manifest.notice || null },
  });
  return { stats: compiled.stats, applied: res };
}

export async function clearRemote() {
  await replaceDynamicRange(RULE_IDS.REMOTE_START, RULE_IDS.REMOTE_END, []);
  await chrome.storage.local.remove(['remoteCosmetic', 'remoteState']);
}

// ---------------------------------------------------------------------------
// Custom subscriptions (abp:subscribe links or URLs added by the user)
// ---------------------------------------------------------------------------
export async function refreshCustomLists(lists) {
  const { customListsCache = {} } = await chrome.storage.local.get('customListsCache');
  const next = {};
  for (const l of lists) {
    try {
      const r = await fetch(l.url, { cache: 'no-store' });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const text = await r.text();
      if (text.length > 8e6) throw new Error('too large');
      next[l.url] = { text, fetched: Date.now() };
    } catch (e) {
      if (customListsCache[l.url]) next[l.url] = { ...customListsCache[l.url], error: String(e.message || e) };
      else next[l.url] = { text: '', error: String(e.message || e), fetched: Date.now() };
    }
  }
  await chrome.storage.local.set({ customListsCache: next });
  return setUserFilters(await getUserFilters());
}

export async function customListsStatus() {
  const { customListsCache = {} } = await chrome.storage.local.get('customListsCache');
  return Object.fromEntries(Object.entries(customListsCache).map(([u, c]) => [u, { fetched: c.fetched, error: c.error || null, lines: (c.text || '').split('\n').length }]));
}
