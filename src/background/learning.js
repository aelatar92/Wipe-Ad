// Wipe Ad — self-learning tracker blocker (inspired by Privacy Badger's heuristic).
// A third-party domain that sets/reads identifying cookies on >= N different sites
// gets blocked (or cookie-blocked when it is needed for sites to work).

import { CONFIG, RULE_IDS, PRIORITY } from '../shared/config.js';
import { getBaseDomain, hostnameOf, sameEntity } from '../shared/domain.js';
import { replaceDynamicRange } from './rules.js';
import { diag } from './diag.js';

// Domains that are often required for sites to work: cookies are stripped instead of blocking.
const YELLOWLIST = new Set([
  'googleapis.com', 'gstatic.com', 'google.com', 'youtube.com', 'ytimg.com', 'cloudflare.com', 'cloudfront.net',
  'jsdelivr.net', 'unpkg.com', 'akamaihd.net', 'akamaized.net', 'fastly.net', 'fbcdn.net', 'twimg.com',
  'recaptcha.net', 'hcaptcha.com', 'paypal.com', 'stripe.com', 'shopify.com', 'vimeo.com', 'vimeocdn.com',
  'disqus.com', 'disquscdn.com', 'microsoft.com', 'live.com', 'microsoftonline.com', 'apple.com', 'icloud.com',
  'wp.com', 'wordpress.com', 'gravatar.com', 'bootstrapcdn.com', 'fontawesome.com', 'typekit.net', 'zendesk.com',
  'intercom.io', 'spotify.com', 'soundcloud.com', 'twitch.tv', 'imgur.com', 'giphy.com', 'github.com',
  'githubusercontent.com', 'jquery.com', 'mapbox.com', 'here.com', 'okta.com', 'auth0.com', 'amazonaws.com',
]);

// entropy (bits) of common non-identifying cookie values
const LOW_ENTROPY = new Map(Object.entries({
  '': 3, 'nodata': 3, 'no_data': 3, 'yes': 3, 'no': 3, 'true': 3, 'false': 3, 'dnt': 3, 'opt-out': 3,
  'optout': 3, 'opt_out': 3, 'null': 3, 'undefined': 3, 'on': 3, 'off': 3, 'none': 3, 'deleted': 3,
  ...Object.fromEntries('0123456789'.split('').map(d => [d, 4])),
  ...Object.fromEntries('ar en fr de es it pt ru tr fa ur zh ja ko nl sv pl he hi id ms th vi en-us en-gb ar-eg ar-sa'.split(' ').map(l => [l, 8])),
}));

let state = null; // { snitch: {base: [sites]}, actions: {base: 'block'|'cookieblock'|'allow'}, user: {base: action} }
let saveTimer = null;
let applyTimer = null;
let threshold = CONFIG.TRACKING_THRESHOLD;
let enabled = true;

async function load() {
  if (state) return state;
  const { learning } = await chrome.storage.local.get('learning');
  state = { snitch: {}, actions: {}, user: {}, ...(learning || {}) };
  return state;
}

function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => chrome.storage.local.set({ learning: state }), 2000);
}

function scheduleApply() {
  clearTimeout(applyTimer);
  applyTimer = setTimeout(applyLearnedRules, 1500);
}

function cookieEntropyHigh(headerValues) {
  let total = 0;
  for (const value of headerValues) {
    for (const part of value.split(/;\s*|\n/)) {
      const eq = part.indexOf('=');
      if (eq <= 0) continue;
      const name = part.slice(0, eq).trim().toLowerCase();
      if (['path', 'domain', 'expires', 'max-age', 'samesite', 'secure', 'httponly', 'priority', 'partitioned'].includes(name)) continue;
      if (name === '__cf_bm' || name === 'cf_clearance') continue;
      const v = part.slice(eq + 1).trim().toLowerCase();
      if (!LOW_ENTROPY.has(v)) return true;
      total += LOW_ENTROPY.get(v);
    }
  }
  return total > CONFIG.MAX_COOKIE_ENTROPY;
}

function firstPartyHost(details) {
  // Chrome: initiator / documentUrl (FF); for sub_frame requests use the parent document
  return hostnameOf(details.documentUrl || details.initiator || details.originUrl || '');
}

async function observe(details, headers) {
  if (!enabled || details.tabId < 0) return;
  const reqHost = hostnameOf(details.url);
  const pageHost = firstPartyHost(details);
  if (!reqHost || !pageHost) return;
  const reqBase = getBaseDomain(reqHost), siteBase = getBaseDomain(pageHost);
  if (reqBase === siteBase || sameEntity(reqBase, siteBase)) return;
  const values = headers.filter(h => /^(set-)?cookie$/i.test(h.name)).map(h => h.value || '');
  if (!values.length || !cookieEntropyHigh(values)) return;
  await load();
  if (state.user[reqBase]) return;
  const sites = state.snitch[reqBase] || (state.snitch[reqBase] = []);
  if (sites.includes(siteBase)) return;
  sites.push(siteBase);
  if (sites.length > 20) sites.splice(0, sites.length - 20);
  if (sites.length >= threshold && !state.actions[reqBase]) {
    state.actions[reqBase] = YELLOWLIST.has(reqBase) ? 'cookieblock' : 'block';
    diag('info', 'learn:' + state.actions[reqBase], { domain: reqBase, sites: sites.slice(-5) });
    scheduleApply();
  }
  scheduleSave();
}

export function startLearning() {
  const filter = { urls: ['http://*/*', 'https://*/*'] };
  const reqSpec = ['requestHeaders'];
  const resSpec = ['responseHeaders'];
  // Chromium needs 'extraHeaders' to see Cookie headers
  if (chrome.webRequest.OnBeforeSendHeadersOptions?.EXTRA_HEADERS) reqSpec.push('extraHeaders');
  if (chrome.webRequest.OnHeadersReceivedOptions?.EXTRA_HEADERS) resSpec.push('extraHeaders');
  chrome.webRequest.onBeforeSendHeaders.addListener(d => { observe(d, d.requestHeaders || []); }, filter, reqSpec);
  chrome.webRequest.onHeadersReceived.addListener(d => { observe(d, d.responseHeaders || []); }, filter, resSpec);
}

export function configureLearning(settings) {
  enabled = settings.enabled && settings.learning;
  threshold = settings.learningThreshold || CONFIG.TRACKING_THRESHOLD;
}

export async function applyLearnedRules() {
  await load();
  const block = [], cookie = [], allow = [];
  const all = { ...state.actions, ...state.user };
  for (const [d, a] of Object.entries(all)) {
    if (a === 'block') block.push(d); else if (a === 'cookieblock') cookie.push(d); else if (a === 'allow') allow.push(d);
  }
  const rules = [];
  const SUB = ['sub_frame', 'stylesheet', 'script', 'image', 'font', 'object', 'xmlhttprequest', 'ping', 'media', 'websocket', 'other'];
  if (enabled && block.length) rules.push({ priority: PRIORITY.LEARN_BLOCK, action: { type: 'block' },
    condition: { requestDomains: block, domainType: 'thirdParty', resourceTypes: SUB } });
  if (enabled && cookie.length) rules.push({ priority: PRIORITY.HEADERS, action: { type: 'modifyHeaders',
    requestHeaders: [{ header: 'Cookie', operation: 'remove' }], responseHeaders: [{ header: 'Set-Cookie', operation: 'remove' }] },
    condition: { requestDomains: cookie, domainType: 'thirdParty', resourceTypes: SUB } });
  if (enabled && allow.length) rules.push({ priority: PRIORITY.USER_ALLOW_LEARN, action: { type: 'allow' },
    condition: { requestDomains: allow, domainType: 'thirdParty' } });
  return replaceDynamicRange(RULE_IDS.LEARN_START, RULE_IDS.LEARN_END, rules);
}

export async function getLearningState() {
  await load();
  const rows = [];
  const domains = new Set([...Object.keys(state.snitch), ...Object.keys(state.user), ...Object.keys(state.actions)]);
  for (const d of domains) {
    rows.push({ domain: d, sites: state.snitch[d] || [], learned: state.actions[d] || 'allow', user: state.user[d] || null });
  }
  rows.sort((a, b) => b.sites.length - a.sites.length);
  return { rows, threshold };
}

export async function setUserAction(domain, action) {
  await load();
  if (!action || action === 'default') delete state.user[domain]; else state.user[domain] = action;
  scheduleSave();
  await applyLearnedRules();
}

export async function getUserActions() { await load(); return { ...state.user }; }

/** Replace the user's per-tracker choices (used by settings sync). */
export async function setUserActions(user) {
  await load();
  if (JSON.stringify(user) === JSON.stringify(state.user)) return;
  state.user = { ...user };
  scheduleSave();
  await applyLearnedRules();
}

export async function resetLearning() {
  state = { snitch: {}, actions: {}, user: {} };
  await chrome.storage.local.set({ learning: state });
  await applyLearnedRules();
}

export async function learnedTrackers() {
  await load();
  return new Set(Object.entries({ ...state.actions, ...state.user }).filter(([, a]) => a !== 'allow').map(([d]) => d));
}

export async function actionFor(base) {
  await load();
  return state.user[base] || state.actions[base] || null;
}
