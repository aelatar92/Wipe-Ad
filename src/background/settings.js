// Wipe Ad — persistent settings (chrome.storage.local)

export const DEFAULTS = {
  enabled: true,
  language: 'auto',               // auto | ar | en
  showBadge: true,
  // filtering
  cosmetic: true,
  scriptlets: true,
  // per-site
  allowlist: [],                  // hostnames where Wipe Ad is off
  siteModes: {},                  // host -> 'basic' | 'standard' | 'strict'
  // privacy / stealth (AdGuard-like)
  gpc: true,                      // Sec-GPC + DNT + navigator.globalPrivacyControl
  removeXClientData: true,
  hideReferrer: false,            // strip Referer on third-party requests
  hideSearchQueries: true,        // strip Referer when leaving search engines
  stripTrackingParams: true,      // utm_*, fbclid, gclid ...
  blockPings: true,               // hyperlink auditing <a ping>
  stripThirdPartyCookies: false,
  autoDeleteTrackerCookies: true, // cookie self-destruct for known trackers
  blockWebRTC: false,             // needs optional "privacy" permission
  // learning (Privacy Badger-like)
  learning: true,
  learningThreshold: 3,
  // cookie consent (Ghostery Never-Consent-like)
  autoConsent: true,
  // malware protection
  malwareWarning: true,
  // updates
  autoUpdateExtension: true,
  autoUpdateFilters: true,
  updateIntervalMin: 360,
  updateBase: '',                 // optional override of CONFIG.UPDATE_BASE (self-hosting)
  // filter lists enabled state; null = use build defaults
  rulesets: null,
  customLists: [],                // [{url, title}]
};

let cache = null;
const listeners = new Set();

export async function getSettings() {
  if (cache) return cache;
  const { settings } = await chrome.storage.local.get('settings');
  cache = { ...DEFAULTS, ...(settings || {}) };
  return cache;
}

export async function setSettings(patch) {
  const cur = await getSettings();
  const prev = { ...cur };
  Object.assign(cur, patch);
  await chrome.storage.local.set({ settings: cur });
  for (const fn of listeners) {
    try { await fn(cur, prev, patch); } catch (e) { console.warn('[WipeAd] settings listener', e); }
  }
  return cur;
}

export function onSettingsChanged(fn) { listeners.add(fn); }


// Temporarily paused sites (session only): host -> until timestamp
let paused = null;
export async function getPaused() {
  if (!paused) { const { paused: p } = await chrome.storage.session.get('paused'); paused = p || {}; }
  const now = Date.now();
  for (const [h, t] of Object.entries(paused)) if (t < now) delete paused[h];
  return paused;
}
export async function setPausedHost(host, until) {
  await getPaused();
  if (until) paused[host] = until; else delete paused[host];
  await chrome.storage.session.set({ paused });
  return paused;
}

export function siteModeFor(settings, host, pausedMap = paused) {
  if (!settings.enabled) return 'off';
  if (!host) return 'standard';
  const h = host.toLowerCase();
  if (pausedMap) for (const p of Object.keys(pausedMap)) if ((h === p || h.endsWith('.' + p)) && pausedMap[p] > Date.now()) return 'off';
  for (const a of settings.allowlist) {
    if (h === a || h.endsWith('.' + a)) return 'off';
  }
  let best = null, bestLen = -1;
  for (const [k, v] of Object.entries(settings.siteModes || {})) {
    if ((h === k || h.endsWith('.' + k)) && k.length > bestLen) { best = v; bestLen = k.length; }
  }
  return best || 'standard';
}
