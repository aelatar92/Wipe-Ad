// Wipe Ad — Stealth / privacy protections (inspired by AdGuard Stealth Mode)

import { RULE_IDS, PRIORITY } from '../shared/config.js';
import { replaceDynamicRange } from './rules.js';

const ALL = ['main_frame', 'sub_frame', 'stylesheet', 'script', 'image', 'font', 'object', 'xmlhttprequest', 'ping', 'media', 'websocket', 'other'];
const SUB = ALL.filter(t => t !== 'main_frame');

export const TRACKING_PARAMS = [
  'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'utm_id', 'utm_name',
  'utm_reader', 'utm_viz_id', 'utm_pubreferrer', 'utm_swu', 'utm_social', 'utm_brand',
  'fbclid', 'gclid', 'gclsrc', 'dclid', 'gbraid', 'wbraid', 'msclkid', 'yclid', 'ysclid', 'twclid', 'ttclid',
  'igshid', 'igsh', 'mc_cid', 'mc_eid', '_hsenc', '_hsmi', '__hssc', '__hstc', '__hsfp', 'hsCtaTracking',
  'mkt_tok', 'oly_anon_id', 'oly_enc_id', 'vero_id', 'vero_conv', 'rb_clickid', 's_cid', 'ml_subscriber',
  'ml_subscriber_hash', 'wickedid', 'epik', 'li_fat_id', 'srsltid', 'si', '_openstat', 'cmpid', 'zanpid',
  'spm', 'scm', 'trk', 'trkCampaign', 'ref_src', 'ref_url', 'sc_cid', 'mbid', 'irclickid', 'aff_platform',
];
const SAFE_GENERIC = new Set(['si', 'spm', 'scm', 'trk', 'cmpid']); // only stripped on known domains
const SEARCH_ENGINES = [
  'google.com', 'google.com.eg', 'google.com.sa', 'google.ae', 'google.co.uk', 'google.de', 'google.fr',
  'bing.com', 'duckduckgo.com', 'yahoo.com', 'yandex.ru', 'yandex.com', 'baidu.com', 'ecosia.org',
  'search.brave.com', 'startpage.com', 'qwant.com', 'ask.com', 'aol.com',
];

function escapeRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

export function buildStealthRules(s) {
  const rules = [];
  if (s.gpc) {
    rules.push({ priority: PRIORITY.HEADERS, action: { type: 'modifyHeaders', requestHeaders: [
      { header: 'Sec-GPC', operation: 'set', value: '1' },
      { header: 'DNT', operation: 'set', value: '1' },
    ] }, condition: { resourceTypes: ALL } });
  }
  if (s.removeXClientData) {
    rules.push({ priority: PRIORITY.HEADERS, action: { type: 'modifyHeaders', requestHeaders: [
      { header: 'X-Client-Data', operation: 'remove' },
    ] }, condition: { resourceTypes: ALL } });
  }
  if (s.hideReferrer) {
    rules.push({ priority: PRIORITY.HEADERS, action: { type: 'modifyHeaders', requestHeaders: [
      { header: 'Referer', operation: 'remove' },
    ] }, condition: { domainType: 'thirdParty', resourceTypes: SUB } });
  }
  if (s.hideSearchQueries) {
    rules.push({ priority: PRIORITY.HEADERS, action: { type: 'modifyHeaders', requestHeaders: [
      { header: 'Referer', operation: 'remove' },
    ] }, condition: { initiatorDomains: SEARCH_ENGINES, domainType: 'thirdParty', resourceTypes: ['main_frame', 'sub_frame'] } });
  }
  if (s.stripTrackingParams) {
    // utm_* family as one rule, the rest in small chunks (RE2 rejects regexes > 2KB compiled)
    const utm = TRACKING_PARAMS.filter(p => p.startsWith('utm_'));
    rules.push({ priority: PRIORITY.REMOVEPARAM, action: { type: 'redirect', redirect: { transform: { queryTransform: { removeParams: utm } } } },
      condition: { regexFilter: '[?&]utm_[a-z_]+=', resourceTypes: ['main_frame', 'sub_frame'] } });
    const rest = TRACKING_PARAMS.filter(p => !p.startsWith('utm_') && !SAFE_GENERIC.has(p));
    for (let i = 0; i < rest.length; i += 10) {
      const chunk = rest.slice(i, i + 10);
      rules.push({ priority: PRIORITY.REMOVEPARAM, action: { type: 'redirect', redirect: { transform: { queryTransform: { removeParams: chunk } } } },
        condition: { regexFilter: `[?&](${chunk.map(escapeRe).join('|')})=`, resourceTypes: ['main_frame', 'sub_frame'] } });
    }
    // YouTube/Spotify "si", AliExpress "spm/scm", LinkedIn "trk"
    rules.push({ priority: PRIORITY.REMOVEPARAM, action: { type: 'redirect', redirect: { transform: { queryTransform: { removeParams: ['si', 'spm', 'scm', 'trk', 'cmpid', 'feature', 'pp'] } } } },
      condition: { regexFilter: '[?&](si|spm|scm|trk|cmpid)=', requestDomains: ['youtube.com', 'youtu.be', 'open.spotify.com', 'aliexpress.com', 'linkedin.com'], resourceTypes: ['main_frame'] } });
  }
  if (s.blockPings) {
    rules.push({ priority: PRIORITY.BLOCK, action: { type: 'block' }, condition: { resourceTypes: ['ping'], domainType: 'thirdParty' } });
  }
  if (s.stripThirdPartyCookies) {
    rules.push({ priority: PRIORITY.HEADERS, action: { type: 'modifyHeaders',
      requestHeaders: [{ header: 'Cookie', operation: 'remove' }],
      responseHeaders: [{ header: 'Set-Cookie', operation: 'remove' }] },
      condition: { domainType: 'thirdParty', resourceTypes: SUB } });
  }
  return rules;
}

export async function applyStealth(settings) {
  const rules = settings.enabled ? buildStealthRules(settings) : [];
  const res = await replaceDynamicRange(RULE_IDS.STEALTH_START, RULE_IDS.STEALTH_END, rules);
  await applyGpcScript(settings.enabled && settings.gpc);
  await applyWebRTC(settings.enabled && settings.blockWebRTC);
  return res;
}

// navigator.globalPrivacyControl in the page's main world
async function applyGpcScript(on) {
  const id = 'wipead-gpc';
  try {
    const existing = await chrome.scripting.getRegisteredContentScripts({ ids: [id] });
    if (on && !existing.length) {
      await chrome.scripting.registerContentScripts([{ id, js: ['content/gpc-main.js'], matches: ['http://*/*', 'https://*/*'],
        runAt: 'document_start', allFrames: true, world: 'MAIN', persistAcrossSessions: true }]);
    } else if (!on && existing.length) {
      await chrome.scripting.unregisterContentScripts({ ids: [id] });
    }
  } catch (e) { console.warn('[WipeAd] GPC script', e.message); }
}

async function applyWebRTC(on) {
  if (!chrome.privacy?.network?.webRTCIPHandlingPolicy) return;
  try {
    if (on) await chrome.privacy.network.webRTCIPHandlingPolicy.set({ value: 'disable_non_proxied_udp' });
    else await chrome.privacy.network.webRTCIPHandlingPolicy.clear({});
  } catch (e) { console.warn('[WipeAd] WebRTC', e.message); }
}
