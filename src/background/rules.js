// Wipe Ad — declarativeNetRequest management (static rulesets + dynamic rule groups)

import { RULE_IDS, PRIORITY, SESSION_IDS } from '../shared/config.js';
import { getCatalog } from './data.js';

const DNR = chrome.declarativeNetRequest;

/** Rulesets forced on by features or by an administrator policy. */
export function forcedRulesets(settings) {
  const ids = [...(settings.forcedRulesets || [])];
  if (settings.safeMode) ids.push('adult');
  if (settings.hideNewsletters) ids.push('annoyances', 'ubo-annoyances');
  return ids;
}

export async function enabledRulesetIds(settings) {
  const cat = await getCatalog();
  const forced = new Set(forcedRulesets(settings));
  return cat.filter(r => forced.has(r.id) || (settings.rulesets?.[r.id] ?? r.enabled)).map(r => r.id);
}

/** Make the browser's enabled static rulesets match our settings. */
export async function syncStaticRulesets(settings) {
  const withDnr = new Set((await getCatalog()).filter(r => r.dnr).map(r => r.id));
  const want = new Set(settings.enabled ? (await enabledRulesetIds(settings)).filter(id => withDnr.has(id)) : []);
  const have = new Set(await DNR.getEnabledRulesets());
  const enable = [...want].filter(id => !have.has(id));
  const disable = [...have].filter(id => !want.has(id));
  if (!enable.length && !disable.length) return { ok: true };
  try {
    await DNR.updateEnabledRulesets({ enableRulesetIds: enable, disableRulesetIds: disable });
    return { ok: true };
  } catch (e) {
    console.warn('[WipeAd] updateEnabledRulesets failed', e);
    return { ok: false, error: String(e.message || e) };
  }
}

/** Replace all dynamic rules whose id is inside [start, end] with `rules` (ids re-assigned). */
export async function replaceDynamicRange(start, end, rules) {
  const existing = await DNR.getDynamicRules();
  const removeRuleIds = existing.filter(r => r.id >= start && r.id <= end).map(r => r.id);
  const max = end - start + 1;
  const addRules = rules.slice(0, max).map((r, i) => ({ ...r, id: start + i }));
  try {
    await DNR.updateDynamicRules({ removeRuleIds, addRules });
    return { ok: true, added: addRules.length, dropped: rules.length - addRules.length };
  } catch (e) {
    // one bad rule makes the whole batch fail — fall back to adding rules one by one
    console.warn('[WipeAd] batch failed, retrying rule by rule', e.message);
    await DNR.updateDynamicRules({ removeRuleIds });
    let added = 0, failed = 0;
    for (const r of addRules) {
      try { await DNR.updateDynamicRules({ addRules: [r] }); added++; } catch { failed++; }
    }
    return { ok: failed === 0, added, failed };
  }
}

// ---------------------------------------------------------------------------
// Per-site rules: allowlist (off) + strict mode
// ---------------------------------------------------------------------------
export async function applySiteRules(settings) {
  const rules = [];
  const allow = [...new Set(settings.allowlist)].filter(Boolean);
  if (!settings.enabled) {
    rules.push({ priority: PRIORITY.SITE_ALLOW, action: { type: 'allow' },
      condition: { regexFilter: '^.', resourceTypes: ['main_frame', 'sub_frame', 'stylesheet', 'script', 'image', 'font', 'object', 'xmlhttprequest', 'ping', 'media', 'websocket', 'other'] } });
  } else if (allow.length) {
    rules.push({ priority: PRIORITY.SITE_ALLOW, action: { type: 'allowAllRequests' },
      condition: { requestDomains: allow, resourceTypes: ['main_frame'] } });
  }
  const strict = Object.entries(settings.siteModes || {}).filter(([, m]) => m === 'strict').map(([h]) => h);
  if (strict.length && settings.enabled) {
    rules.push({ priority: PRIORITY.STRICT, action: { type: 'block' },
      condition: { initiatorDomains: strict, domainType: 'thirdParty', resourceTypes: ['script', 'sub_frame', 'object'] } });
    rules.push({ priority: PRIORITY.STRICT, action: { type: 'block' },
      condition: { initiatorDomains: strict, domainType: 'thirdParty', resourceTypes: ['font', 'ping', 'websocket'] } });
  }
  return replaceDynamicRange(RULE_IDS.SITES_START, RULE_IDS.SITES_END, rules);
}

// ---------------------------------------------------------------------------
// Session rules: pause & "proceed anyway" on the malware warning page
// ---------------------------------------------------------------------------
export async function setPaused(hosts) {
  const existing = await DNR.getSessionRules();
  const removeRuleIds = existing.filter(r => r.id === SESSION_IDS.PAUSE).map(r => r.id);
  const addRules = hosts.length ? [{ id: SESSION_IDS.PAUSE, priority: PRIORITY.SITE_ALLOW, action: { type: 'allowAllRequests' },
    condition: { requestDomains: hosts, resourceTypes: ['main_frame'] } }] : [];
  await DNR.updateSessionRules({ removeRuleIds, addRules });
}

export async function allowOnce(host) {
  const existing = await DNR.getSessionRules();
  const ids = existing.map(r => r.id);
  let id = SESSION_IDS.PROCEED_START;
  while (ids.includes(id)) id++;
  await DNR.updateSessionRules({ addRules: [{ id, priority: PRIORITY.SITE_ALLOW + 1, action: { type: 'allowAllRequests' },
    condition: { requestDomains: [host], resourceTypes: ['main_frame'] } }] });
}

export async function ruleCounts() {
  const [dyn, ses, enabled] = await Promise.all([DNR.getDynamicRules(), DNR.getSessionRules(), DNR.getEnabledRulesets()]);
  const inRange = (a, b) => dyn.filter(r => r.id >= a && r.id <= b).length;
  let available = null;
  try { available = await DNR.getAvailableStaticRuleCount(); } catch { /* Firefox */ }
  return {
    enabledRulesets: enabled, session: ses.length, dynamic: dyn.length, availableStatic: available,
    stealth: inRange(RULE_IDS.STEALTH_START, RULE_IDS.STEALTH_END),
    learning: inRange(RULE_IDS.LEARN_START, RULE_IDS.LEARN_END),
    sites: inRange(RULE_IDS.SITES_START, RULE_IDS.SITES_END),
    user: inRange(RULE_IDS.USER_START, RULE_IDS.USER_END),
    remote: inRange(RULE_IDS.REMOTE_START, RULE_IDS.REMOTE_END),
  };
}
