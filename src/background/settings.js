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
  // v1.1 features
  skipRedirects: true,            // l.facebook.com/l.php?u=…, google.com/url?q=… → straight to the target
  fpDetect: true,                 // report fingerprinting attempts
  antiFingerprint: false,         // add noise to canvas / WebGL / audio fingerprints
  blockNotificationPrompts: false,
  stopAutoplay: false,
  hideNewsletters: false,         // enables the annoyance lists
  cnameUncloak: false,            // resolve first-party subdomains (DNS-over-HTTPS) to find cloaked trackers
  syncEnabled: false,             // chrome.storage.sync
  weeklyReport: true,
  serpBadges: true,               // warnings next to search results
  safeMode: false,                // adult-content blocking + SafeSearch
  focus: { enabled: false, sites: [], days: [0, 1, 2, 3, 4, 5, 6], from: '09:00', to: '17:00', allDay: false },
  aiApiKey: '',                   // Anthropic API key for the AI filter assistant (never synced or exported)
};

// Settings that never leave this device (sync / backup)
export const LOCAL_ONLY = ['aiApiKey', 'syncEnabled'];

let cache = null;
let policy = null;
const listeners = new Set();

/** Administrator policy from chrome.storage.managed (enterprise / school deployments). */
export async function getPolicy() {
  if (policy) return policy;
  let p = {};
  try { p = (await chrome.storage.managed?.get(null)) || {}; } catch { /* no policy / unsupported */ }
  policy = {
    lockedSettings: p.lockedSettings && typeof p.lockedSettings === 'object' ? p.lockedSettings : {},
    allowlist: Array.isArray(p.allowlist) ? p.allowlist.map(s => String(s).toLowerCase()) : [],
    forcedRulesets: Array.isArray(p.forcedRulesets) ? p.forcedRulesets.map(String) : [],
    disableUserFilters: p.disableUserFilters === true,
    disableAI: p.disableAI === true,
  };
  policy.active = Object.keys(policy.lockedSettings).length > 0 || policy.allowlist.length > 0 || policy.forcedRulesets.length > 0 || policy.disableUserFilters || policy.disableAI;
  policy.lockedKeys = [...Object.keys(policy.lockedSettings), ...(policy.disableAI ? ['aiApiKey'] : [])];
  return policy;
}

function applyPolicy(s, p) {
  Object.assign(s, p.lockedSettings);
  if (p.allowlist.length) s.allowlist = [...new Set([...(s.allowlist || []), ...p.allowlist])];
  s.forcedRulesets = p.forcedRulesets;
  if (p.disableAI) s.aiApiKey = '';
  return s;
}

globalThis.chrome?.storage?.managed?.onChanged?.addListener(() => { policy = null; cache = null; });

export async function getSettings() {
  if (cache) return cache;
  const { settings } = await chrome.storage.local.get('settings');
  cache = applyPolicy({ ...DEFAULTS, ...(settings || {}) }, await getPolicy());
  return cache;
}

export async function setSettings(patch) {
  const cur = await getSettings();
  const p = await getPolicy();
  patch = { ...patch };
  for (const k of p.lockedKeys) delete patch[k];
  if (patch.allowlist && p.allowlist.length) patch.allowlist = [...new Set([...patch.allowlist, ...p.allowlist])];
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
