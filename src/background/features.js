// Wipe Ad — v1.1 features that are mostly declarative rules or page-world scripts:
// tracking-redirect skipping, fingerprinting protection, annoyance blockers,
// focus mode and family safe mode.

import { RULE_IDS, PRIORITY } from '../shared/config.js';
import { replaceDynamicRange, enabledRulesetIds } from './rules.js';
import { getCatalog } from './data.js';

// ---------------------------------------------------------------------------
// Scriptlets of the bundled lists, registered at document_start in the page world
// (one generated file per list, matched only on the hosts that list targets)
// ---------------------------------------------------------------------------
export async function applyScriptletScripts(settings) {
  const cat = await getCatalog();
  const on = new Set(settings.enabled && settings.scriptlets ? await enabledRulesetIds(settings) : []);
  const offHosts = [...new Set([...(settings.allowlist || []), ...Object.entries(settings.siteModes || {}).filter(([, m]) => m === 'basic').map(([h]) => h)])];
  const excludeMatches = offHosts.flatMap(h => [`*://${h}/*`, `*://*.${h}/*`]);
  const want = new Map();
  for (const r of cat) {
    if (!on.has(r.id)) continue;
    (r.scriptletShards || []).forEach((s, i) => want.set(`wipead-sl-${r.id}-${i}`, s));
  }
  const registered = (await chrome.scripting.getRegisteredContentScripts()).filter(s => s.id.startsWith('wipead-sl-'));
  const have = new Set(registered.map(s => s.id));
  const remove = [...have].filter(id => !want.has(id));
  if (remove.length) await chrome.scripting.unregisterContentScripts({ ids: remove }).catch(() => {});
  // shards that stay only need their exclusions refreshed
  const keep = registered.filter(s => want.has(s.id) && JSON.stringify(s.excludeMatches || []) !== JSON.stringify(excludeMatches));
  if (keep.length) await chrome.scripting.updateContentScripts(keep.map(s => ({ id: s.id, excludeMatches }))).catch(e => console.warn('[WipeAd] update scriptlets', e.message));
  const add = [...want].filter(([id]) => !have.has(id)).map(([id, s]) => ({ id, js: [s.file, 'scriptlets/lists/runtime.js'],
    matches: s.hosts.flatMap(h => [`*://${h}/*`, `*://*.${h}/*`]), excludeMatches,
    runAt: 'document_start', allFrames: true, world: 'MAIN', persistAcrossSessions: true }));
  if (add.length) {
    try { await chrome.scripting.registerContentScripts(add); }
    catch (e) {
      console.warn('[WipeAd] batch scriptlet registration failed, retrying one by one', e.message);
      for (const sc of add) await chrome.scripting.registerContentScripts([sc]).catch(err => console.warn('[WipeAd]', sc.id, err.message));
    }
  }
  return want.size;
}

// ---------------------------------------------------------------------------
// Page (MAIN world) scripts, registered/unregistered according to settings
// ---------------------------------------------------------------------------
const MAIN_SCRIPTS = [
  { id: 'wipead-fp-noise', file: 'content/fp-noise.js', on: s => s.antiFingerprint },
  { id: 'wipead-fp-detect', file: 'content/fp-detect.js', on: s => s.fpDetect || s.antiFingerprint },
  { id: 'wipead-notif', file: 'content/notif-main.js', on: s => s.blockNotificationPrompts },
  { id: 'wipead-autoplay', file: 'content/autoplay-main.js', on: s => s.stopAutoplay },
];

export async function applyMainWorldScripts(settings) {
  const registered = new Set((await chrome.scripting.getRegisteredContentScripts()).map(s => s.id));
  const excludeMatches = [...new Set(settings.allowlist || [])].flatMap(h => [`*://${h}/*`, `*://*.${h}/*`]);
  for (const sc of MAIN_SCRIPTS) {
    const want = settings.enabled && sc.on(settings);
    try {
      if (registered.has(sc.id)) await chrome.scripting.unregisterContentScripts({ ids: [sc.id] });
      if (want) {
        await chrome.scripting.registerContentScripts([{ id: sc.id, js: [sc.file], matches: ['http://*/*', 'https://*/*'],
          excludeMatches, runAt: 'document_start', allFrames: true, world: 'MAIN', persistAcrossSessions: true }]);
      }
    } catch (e) { console.warn('[WipeAd] main-world script', sc.id, e.message); }
  }
}

// ---------------------------------------------------------------------------
// Skip tracking redirects (l.facebook.com, google.com/url, youtube.com/redirect …)
// The browser sends the navigation to ui/skip.html, which decodes the real target.
// ---------------------------------------------------------------------------
export const REDIRECTORS = [
  '^https?://(www\\.)?google\\.[a-z.]+/url\\?.*',
  '^https?://l[m]?\\.facebook\\.com/l\\.php\\?.*',
  '^https?://l\\.instagram\\.com/\\?.*',
  '^https?://l\\.messenger\\.com/l\\.php\\?.*',
  '^https?://(www\\.)?youtube\\.com/redirect\\?.*',
  '^https?://out\\.reddit\\.com/.*\\?.*url=.*',
  '^https?://steamcommunity\\.com/linkfilter/\\?.*',
  '^https?://(m\\.)?vk\\.com/away\\.php\\?.*',
  '^https?://[a-z0-9]+\\.safelinks\\.protection\\.outlook\\.com/\\?.*',
  '^https?://disq\\.us/url\\?.*',
  '^https?://slack-redir\\.net/link\\?.*',
  '^https?://(www\\.)?linkedin\\.com/redir/redirect\\?.*',
  '^https?://(www\\.)?deviantart\\.com/users/outgoing\\?.*',
  '^https?://href\\.li/\\?.*',
  '^https?://(www\\.)?bing\\.com/ck/a\\?.*u=a1.*',
];

export function buildSkipRules() {
  const page = chrome.runtime.getURL('ui/skip.html');
  return REDIRECTORS.map(re => ({
    priority: PRIORITY.REDIRECT + 5, action: { type: 'redirect', redirect: { regexSubstitution: `${page}#\\0` } },
    condition: { regexFilter: re, resourceTypes: ['main_frame'] },
  }));
}

// ---------------------------------------------------------------------------
// Focus mode: distracting sites are replaced by ui/focus.html during the schedule
// ---------------------------------------------------------------------------
const toMin = s => { const [h, m] = String(s || '0:0').split(':').map(Number); return (h || 0) * 60 + (m || 0); };

export function focusActive(f, now = new Date()) {
  if (!f?.enabled || !f.sites?.length) return false;
  if (!(f.days || []).includes(now.getDay())) return false;
  if (f.allDay) return true;
  const cur = now.getHours() * 60 + now.getMinutes();
  const from = toMin(f.from), to = toMin(f.to);
  return from <= to ? cur >= from && cur < to : cur >= from || cur < to; // overnight ranges
}

function buildFocusRules(f) {
  return [{ priority: PRIORITY.SITE_ALLOW - 1, action: { type: 'redirect', redirect: { extensionPath: '/ui/focus.html' } },
    condition: { requestDomains: f.sites, resourceTypes: ['main_frame'] } }];
}

// ---------------------------------------------------------------------------
// Safe mode: SafeSearch on major engines + YouTube restricted mode
// (adult-content domains come from the "adult" ruleset, forced on in rules.js)
// ---------------------------------------------------------------------------
function buildSafeRules() {
  const add = (params) => ({ type: 'redirect', redirect: { transform: { queryTransform: { addOrReplaceParams: params } } } });
  return [
    { priority: PRIORITY.REMOVEPARAM + 1, action: add([{ key: 'safe', value: 'active' }]),
      condition: { regexFilter: '^https?://(www\\.)?google\\.[a-z.]+/(search|images)\\?', resourceTypes: ['main_frame', 'sub_frame', 'xmlhttprequest'] } },
    { priority: PRIORITY.REMOVEPARAM + 1, action: add([{ key: 'adlt', value: 'strict' }]),
      condition: { regexFilter: '^https?://(www\\.)?bing\\.com/(search|images|videos)', resourceTypes: ['main_frame', 'sub_frame'] } },
    { priority: PRIORITY.REMOVEPARAM + 1, action: add([{ key: 'kp', value: '1' }]),
      condition: { requestDomains: ['duckduckgo.com'], resourceTypes: ['main_frame', 'sub_frame'] } },
    { priority: PRIORITY.HEADERS, action: { type: 'modifyHeaders', requestHeaders: [{ header: 'YouTube-Restrict', operation: 'set', value: 'Strict' }] },
      condition: { requestDomains: ['youtube.com', 'youtube-nocookie.com', 'youtubei.googleapis.com'] } },
  ];
}

let lastFocusState = null;

export async function applyFeatureRules(settings, { force = false } = {}) {
  const on = settings.enabled;
  await replaceDynamicRange(RULE_IDS.SKIP_START, RULE_IDS.SKIP_END, on && settings.skipRedirects ? buildSkipRules() : []);
  await replaceDynamicRange(RULE_IDS.SAFE_START, RULE_IDS.SAFE_END, on && settings.safeMode ? buildSafeRules() : []);
  await applyFocus(settings, true);
}

export async function applyFocus(settings, force = false) {
  const active = settings.enabled && focusActive(settings.focus);
  const sig = JSON.stringify([active, settings.focus?.sites]);
  if (!force && sig === lastFocusState) return active;
  lastFocusState = sig;
  await replaceDynamicRange(RULE_IDS.FOCUS_START, RULE_IDS.FOCUS_END, active ? buildFocusRules(settings.focus) : []);
  return active;
}
