// Wipe Ad — cosmetic filtering & scriptlet injection (background side)

import { hostnameOf } from '../shared/domain.js';
import { cosmeticFor, genericForTokens, scriptletsFor, getIndex } from './data.js';
import { getSettings, siteModeFor, getPaused } from './settings.js';
import { wipeAdScriptlets } from '../scriptlets/scriptlets.js';

const HIDE = '{display:none!important;visibility:hidden!important}';
const injected = new Map(); // `${tabId}:${frameId}` -> url

function cssFrom(selectors) {
  let out = '';
  for (const s of selectors) {
    if (!s || s.includes('{') || s.includes('}')) continue;
    out += s + HIDE + '\n';
  }
  return out;
}

function stylesCss(styles) {
  let out = '';
  for (const [sel, style] of styles) {
    if (sel.includes('{') || style.includes('}') || style.includes('{')) continue;
    const decl = style.split(';').map(x => x.trim()).filter(Boolean).map(x => x.replace(/\s*!important\s*$/, '') + '!important').join(';');
    out += `${sel}{${decl}}\n`;
  }
  return out;
}

async function insertCss(tabId, frameId, css) {
  if (!css) return;
  try {
    await chrome.scripting.insertCSS({ target: { tabId, frameIds: [frameId] }, css, origin: 'USER' });
  } catch (e) { /* frame gone or restricted page */ }
}

export async function modeForUrl(url) {
  const settings = await getSettings();
  return { settings, mode: siteModeFor(settings, hostnameOf(url), await getPaused()) };
}

async function injectFrame(tabId, frameId, url, pageUrl) {
  const host = hostnameOf(url) || hostnameOf(pageUrl);
  if (!host || !getIndex()) return;
  const { settings, mode } = await modeForUrl(pageUrl || url);
  if (mode === 'off' || mode === 'basic') return;
  const key = `${tabId}:${frameId}`;
  if (injected.get(key) === url) return;
  injected.set(key, url);
  if (settings.scriptlets) {
    const list = scriptletsFor(host);
    if (list.length) {
      try {
        await chrome.scripting.executeScript({ target: { tabId, frameIds: [frameId] }, world: 'MAIN',
          injectImmediately: true, func: wipeAdScriptlets, args: [list] });
      } catch { /* ignore */ }
    }
  }
  if (settings.cosmetic) {
    const c = cosmeticFor(host);
    if (!c || c.disabled) return;
    await insertCss(tabId, frameId, cssFrom(c.specific) + cssFrom(c.complex) + stylesCss(c.styles));
  }
}

export function startCosmetic() {
  chrome.webNavigation.onCommitted.addListener(async d => {
    if (!/^https?:/.test(d.url)) return;
    let pageUrl = d.url;
    if (d.frameId !== 0) {
      try { pageUrl = (await chrome.tabs.get(d.tabId)).url || d.url; } catch { /* ignore */ }
    }
    injectFrame(d.tabId, d.frameId, d.url, pageUrl);
  });
  chrome.tabs.onRemoved.addListener(tabId => {
    for (const k of injected.keys()) if (k.startsWith(tabId + ':')) injected.delete(k);
  });
}

/** Message from content/main.js at document_start */
export async function onFrameInit(msg, sender) {
  const tabId = sender.tab?.id, frameId = sender.frameId ?? 0;
  const url = msg.url || sender.url || '';
  const pageUrl = sender.tab?.url || url;
  const { settings, mode } = await modeForUrl(pageUrl);
  const lang = settings.language === 'auto' ? ((chrome.i18n.getUILanguage() || '').startsWith('ar') ? 'ar' : 'en') : settings.language;
  const res = { mode, lang, cosmetic: settings.cosmetic, serpBadges: settings.serpBadges, autoConsent: settings.autoConsent && mode !== 'off', procedural: [], generic: false };
  if (mode === 'off' || mode === 'basic' || tabId === undefined) return res;
  await injectFrame(tabId, frameId, url, pageUrl); // no-op when already done by onCommitted
  if (settings.cosmetic) {
    const c = cosmeticFor(hostnameOf(url) || hostnameOf(pageUrl));
    if (c && !c.disabled) { res.procedural = c.procedural; res.generic = !c.noGeneric; }
  }
  return res;
}

/** Content script reports class/id tokens seen in the DOM. */
export async function onTokens(msg, sender) {
  const tabId = sender.tab?.id;
  if (tabId === undefined) return { count: 0 };
  const host = hostnameOf(msg.url || sender.url || '');
  const sels = genericForTokens(host, msg.tokens || []);
  if (sels.length) await insertCss(tabId, sender.frameId ?? 0, cssFrom(sels));
  return { count: sels.length };
}

/** Apply a freshly created picker filter immediately. */
export async function applySelectorNow(tabId, selector) {
  await insertCss(tabId, 0, cssFrom([selector]));
}
