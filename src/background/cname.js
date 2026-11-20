// Wipe Ad — CNAME uncloaking. Some sites hide trackers behind their own subdomain
// (metrics.site.com → CNAME → tracker.example). We resolve first-party subdomains and block
// the ones that point to a known tracker. Opt-in: Chromium resolves through Cloudflare
// DNS-over-HTTPS (the hostname is sent to Cloudflare); Firefox uses its own DNS API.

import { RULE_IDS, PRIORITY } from '../shared/config.js';
import { getBaseDomain, hostnameOf } from '../shared/domain.js';
import { replaceDynamicRange } from './rules.js';

const TTL = 7 * 24 * 3600 * 1000;
const MAX_PER_HOUR = 300;
let state = null;            // { checked: {host: [ts, target|null]}, cloaked: {host: target} }
let enabled = false;
let categoryOf = null;
let learned = null;
const queue = [];
let running = 0, budget = MAX_PER_HOUR, budgetReset = Date.now() + 3600e3;
let saveTimer = null, applyTimer = null;

async function load() {
  if (!state) { const { cname } = await chrome.storage.local.get('cname'); state = { checked: {}, cloaked: {}, ...(cname || {}) }; }
  return state;
}
const save = () => { clearTimeout(saveTimer); saveTimer = setTimeout(() => chrome.storage.local.set({ cname: state }), 3000); };

async function resolveCname(host) {
  if (globalThis.browser?.dns?.resolve) {
    const r = await browser.dns.resolve(host, ['canonical_name']);
    return r.canonicalName && r.canonicalName !== host ? r.canonicalName.replace(/\.$/, '') : null;
  }
  const res = await fetch(`https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(host)}&type=CNAME`, { headers: { accept: 'application/dns-json' } });
  if (!res.ok) throw new Error('DoH ' + res.status);
  const j = await res.json();
  const ans = (j.Answer || []).filter(a => a.type === 5).map(a => a.data.replace(/\.$/, ''));
  return ans.length ? ans[ans.length - 1] : null;
}

async function worker() {
  if (running >= 2) return;
  running++;
  try {
    while (queue.length) {
      if (Date.now() > budgetReset) { budget = MAX_PER_HOUR; budgetReset = Date.now() + 3600e3; }
      if (budget-- <= 0) { queue.length = 0; break; }
      const host = queue.shift();
      let target = null;
      try { target = await resolveCname(host); } catch { continue; }
      state.checked[host] = [Date.now(), target];
      if (target && getBaseDomain(target) !== getBaseDomain(host)) {
        const cat = await categoryOf(target);
        const isLearned = (await learned()).has(getBaseDomain(target));
        if (cat === 't' || cat === 'a' || cat === 'm' || isLearned) {
          state.cloaked[host] = target;
          clearTimeout(applyTimer); applyTimer = setTimeout(applyCnameRules, 1000);
        }
      }
      save();
    }
  } finally { running--; }
}

export function configureCname(settings, deps) {
  enabled = settings.enabled && settings.cnameUncloak;
  categoryOf = deps.categoryOf; learned = deps.learned;
}

/** Called for every request: queue first-party subdomains we have not checked yet. */
export async function observeRequest(details) {
  if (!enabled || details.tabId < 0) return;
  const host = hostnameOf(details.url);
  const page = hostnameOf(details.initiator || details.documentUrl || '');
  if (!host || !page || host === page) return;
  const base = getBaseDomain(host);
  if (base !== getBaseDomain(page) || host === base || host === 'www.' + base) return;
  await load();
  const c = state.checked[host];
  if ((c && Date.now() - c[0] < TTL) || queue.includes(host)) return;
  state.checked[host] = [Date.now(), null]; // mark pending
  queue.push(host);
  worker();
}

export async function applyCnameRules() {
  await load();
  const hosts = enabled ? Object.keys(state.cloaked) : [];
  const rules = hosts.length ? [{ priority: PRIORITY.BLOCK, action: { type: 'block' },
    condition: { requestDomains: hosts, resourceTypes: ['script', 'image', 'xmlhttprequest', 'ping', 'sub_frame', 'other'] } }] : [];
  return replaceDynamicRange(RULE_IDS.CNAME_START, RULE_IDS.CNAME_END, rules);
}

export async function cnameState() {
  await load();
  return { checked: Object.keys(state.checked).length, cloaked: state.cloaked };
}

export async function resetCname() {
  state = { checked: {}, cloaked: {} };
  await chrome.storage.local.set({ cname: state });
  await applyCnameRules();
}
