// Wipe Ad — content script (isolated world, document_start, all frames)
// - generic cosmetic filtering: collects class/id tokens and asks the background for matching selectors
// - procedural cosmetic filters (:has-text, :upward, :remove, ...)
// - automatic cookie-consent refusal
// - abp:subscribe link handling
(() => {
  'use strict';
  if (window.__wipeAdContent) return;
  window.__wipeAdContent = true;
  const api = globalThis.browser?.runtime?.id ? globalThis.browser : chrome;
  const send = (msg) => new Promise(res => {
    try { api.runtime.sendMessage(msg, r => { void api.runtime.lastError; res(r); }); } catch { res(null); }
  });

  // -------------------------------------------------------------------------
  // Generic cosmetic: token collection
  // -------------------------------------------------------------------------
  const seenTokens = new Set();
  let pending = new Set();
  let flushTimer = null;
  function addToken(t) { if (!seenTokens.has(t)) { seenTokens.add(t); pending.add(t); } }
  function collect(el) {
    if (el.nodeType !== 1) return;
    if (el.id) addToken('#' + el.id);
    const cl = el.classList;
    if (cl) for (let i = 0; i < cl.length; i++) addToken('.' + cl[i]);
  }
  function scan(root) {
    if (!root || root.nodeType !== 1 && root.nodeType !== 9) return;
    if (root.nodeType === 1) collect(root);
    const els = root.querySelectorAll ? root.querySelectorAll('[id],[class]') : [];
    for (let i = 0; i < els.length; i++) collect(els[i]);
    schedule();
  }
  function schedule() {
    if (flushTimer || !pending.size) return;
    flushTimer = setTimeout(flush, seenTokens.size < 200 ? 1 : 60);
  }
  function flush() {
    flushTimer = null;
    if (!pending.size) return;
    const tokens = [...pending];
    pending = new Set();
    send({ type: 'cosmetic:tokens', url: location.href, tokens });
  }

  // -------------------------------------------------------------------------
  // Procedural filters
  // -------------------------------------------------------------------------
  function toRegex(s) {
    const m = /^\/(.+)\/([imsu]*)$/.exec(s);
    if (m) { try { return new RegExp(m[1], m[2]); } catch { return null; } }
    return { test: x => x.includes(s) };
  }
  function parseProcedural(raw) {
    // splits "base:op(arg):op(arg)" honoring parentheses
    const ops = [];
    let base = '', i = 0;
    const OPS = ['has-text', '-abp-contains', 'contains', 'upward', 'remove', 'style', '-abp-has', 'matches-css', 'min-text-length', 'remove-attr', 'remove-class', 'nth-ancestor', 'matches-attr', 'xpath', 'others', 'watch-attr', 'matches-path', 'matches-media'];
    while (i < raw.length) {
      if (raw[i] === ':') {
        const name = OPS.find(o => raw.startsWith(o + '(', i + 1));
        if (name) {
          let depth = 0, j = i + 1 + name.length;
          for (; j < raw.length; j++) { if (raw[j] === '(') depth++; else if (raw[j] === ')') { depth--; if (depth === 0) break; } }
          ops.push([name, raw.slice(i + name.length + 2, j)]);
          i = j + 1; continue;
        }
      }
      if (!ops.length) base += raw[i]; else if (raw[i] !== ' ') { ops.push(['css', raw.slice(i)]); break; }
      i++;
    }
    return { base: base.trim() || '*', ops };
  }
  function runProcedural(p) {
    let nodes;
    try { nodes = [...document.querySelectorAll(p.base)]; } catch { return; }
    let action = 'hide', style = null, attr = null;
    for (const [op, arg] of p.ops) {
      if (!nodes.length) return;
      switch (op) {
        case 'has-text': case '-abp-contains': case 'contains': { const re = toRegex(arg.replace(/^["']|["']$/g, '')); if (!re) return; nodes = nodes.filter(n => re.test(n.textContent || '')); break; }
        case '-abp-has': nodes = nodes.filter(n => { try { return n.querySelector(arg.replace(/^>\s*/, ':scope > ')); } catch { return false; } }); break;
        case 'upward': case 'nth-ancestor': {
          const k = parseInt(arg, 10);
          nodes = nodes.map(n => { if (k > 0) { let x = n; for (let j = 0; j < k && x; j++) x = x.parentElement; return x; } try { return n.parentElement?.closest(arg); } catch { return null; } }).filter(Boolean);
          break;
        }
        case 'min-text-length': { const k = parseInt(arg, 10); nodes = nodes.filter(n => (n.textContent || '').length >= k); break; }
        case 'matches-css': { const m = arg.match(/^\s*([\w-]+)\s*:\s*(.+)$/); if (!m) return; const re = toRegex(m[2].trim()); nodes = nodes.filter(n => re && re.test(getComputedStyle(n).getPropertyValue(m[1]))); break; }
        case 'matches-path': { const re = toRegex(arg); if (!re || !re.test(location.pathname + location.search)) return; break; }
        case 'matches-attr': { const m = arg.match(/^"?([^"=]+)"?(?:="?(.*?)"?)?$/); if (!m) return; const nr = toRegex(m[1]), vr = m[2] ? toRegex(m[2]) : null; nodes = nodes.filter(n => [...n.attributes].some(a => nr.test(a.name) && (!vr || vr.test(a.value)))); break; }
        case 'xpath': { const out = []; for (const n of nodes) { try { const r = document.evaluate(arg, n, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null); for (let j = 0; j < r.snapshotLength; j++) out.push(r.snapshotItem(j)); } catch { /* ignore */ } } nodes = out.filter(n => n.nodeType === 1); break; }
        case 'css': nodes = nodes.flatMap(n => { try { return [...n.querySelectorAll(':scope' + (arg.startsWith(' ') || arg.startsWith('>') ? '' : ' ') + arg)]; } catch { return []; } }); break;
        case 'remove': action = 'remove'; break;
        case 'style': action = 'style'; style = arg; break;
        case 'remove-attr': action = 'remove-attr'; attr = arg.replace(/^["']|["']$/g, ''); break;
        case 'remove-class': action = 'remove-class'; attr = arg.replace(/^["']|["']$/g, ''); break;
        case 'others': case 'watch-attr': case 'matches-media': break;
      }
    }
    for (const n of nodes) {
      if (action === 'remove') n.remove();
      else if (action === 'style' && style) n.setAttribute('style', (n.getAttribute('style') || '') + ';' + style.replace(/;?\s*$/, '').split(';').map(d => d + ' !important').join(';'));
      else if (action === 'remove-attr') n.removeAttribute(attr);
      else if (action === 'remove-class') n.classList.remove(attr);
      else if (n.style.getPropertyValue('display') !== 'none') n.style.setProperty('display', 'none', 'important');
    }
  }
  let procedural = [];
  let procTimer = null;
  function runAllProcedural() {
    procTimer = null;
    for (const p of procedural) { try { runProcedural(p); } catch { /* ignore */ } }
  }
  function scheduleProcedural() { if (procedural.length && !procTimer) procTimer = setTimeout(runAllProcedural, 100); }

  // -------------------------------------------------------------------------
  // Cookie consent auto-refusal (Never-Consent-like)
  // -------------------------------------------------------------------------
  const CMP = [
    { name: 'OneTrust', detect: '#onetrust-banner-sdk,#onetrust-consent-sdk', reject: ['#onetrust-reject-all-handler', '.ot-pc-refuse-all-handler', 'button.onetrust-close-btn-handler'], hide: '#onetrust-consent-sdk' },
    { name: 'Cookiebot', detect: '#CybotCookiebotDialog', reject: ['#CybotCookiebotDialogBodyButtonDecline', '#CybotCookiebotDialogBodyLevelButtonLevelOptinDeclineAll', 'button[data-cookiebanner="reject_button"]'], hide: '#CybotCookiebotDialog,#CybotCookiebotDialogBodyUnderlay' },
    { name: 'Didomi', detect: '#didomi-host,#didomi-popup', reject: ['#didomi-notice-disagree-button', '.didomi-continue-without-agreeing', 'button[aria-label*="Disagree" i]'], hide: '#didomi-host' },
    { name: 'Quantcast', detect: '.qc-cmp2-container,#qc-cmp2-container', reject: ['.qc-cmp2-summary-buttons button[mode="secondary"]', 'button.qc-cmp2-hide-desktop[mode="secondary"]'], hide: '.qc-cmp2-container' },
    { name: 'Usercentrics', detect: '#usercentrics-root,#usercentrics-cmp-ui', shadow: '#usercentrics-root', reject: ['[data-testid="uc-deny-all-button"]', 'button.deny'], hide: '#usercentrics-root,#usercentrics-cmp-ui' },
    { name: 'TrustArc', detect: '#truste-consent-track,#truste-consent-required', reject: ['#truste-consent-required', 'button.truste-button2'], hide: '#truste-consent-track' },
    { name: 'Google FC', detect: '.fc-consent-root', reject: ['.fc-cta-do-not-consent', 'button.fc-cta-do-not-consent'], hide: '.fc-consent-root' },
    { name: 'Complianz', detect: '.cmplz-cookiebanner', reject: ['.cmplz-btn.cmplz-deny'], hide: '.cmplz-cookiebanner' },
    { name: 'CookieYes', detect: '.cky-consent-container', reject: ['.cky-btn-reject'], hide: '.cky-consent-container,.cky-overlay' },
    { name: 'Osano', detect: '.osano-cm-window', reject: ['.osano-cm-denyAll', '.osano-cm-button--type_denyAll'], hide: '.osano-cm-window' },
    { name: 'Iubenda', detect: '#iubenda-cs-banner', reject: ['.iubenda-cs-reject-btn'], hide: '#iubenda-cs-banner' },
    { name: 'Klaro', detect: '.klaro .cookie-notice,.klaro .cookie-modal', reject: ['.cm-btn-decline', '.cn-decline'], hide: '.klaro' },
    { name: 'Axeptio', detect: '#axeptio_overlay', reject: ['#axeptio_btn_dismiss'], hide: '#axeptio_overlay' },
    { name: 'Borlabs', detect: '#BorlabsCookieBox', reject: ['a[data-cookie-refuse]', '._brlbs-refuse-btn a', '.brlbs-btn-accept-only-essential'], hide: '#BorlabsCookieBox' },
    { name: 'CookieInformation', detect: '#coiOverlay', reject: ['#declineButton', 'button.coi-banner__decline'], hide: '#coiOverlay' },
    { name: 'Termly', detect: '[data-tid="banner-wrapper"]', reject: ['[data-tid="banner-decline"]'], hide: '[data-tid="banner-wrapper"]' },
    { name: 'Sirdata', detect: '#sd-cmp', reject: ['#sd-cmp .sd-cmp-3cRQ2', 'button[title*="refuse" i]'], hide: '#sd-cmp' },
    { name: 'Ezoic', detect: '#ez-cookie-dialog-wrapper', reject: ['#ez-reject-all'], hide: '#ez-cookie-dialog-wrapper' },
    { name: 'CookieScript', detect: '#cookiescript_injected', reject: ['#cookiescript_reject'], hide: '#cookiescript_injected' },
    { name: 'Moove GDPR', detect: '#moove_gdpr_cookie_info_bar', reject: ['.moove-gdpr-infobar-reject-btn'], hide: '#moove_gdpr_cookie_info_bar' },
    { name: 'WP Cookie Notice', detect: '#cookie-notice', reject: ['#cn-refuse-cookie'], hide: '#cookie-notice' },
    { name: 'CookieFirst', detect: '.cookiefirst-root', reject: ['button[data-cookiefirst-action="reject"]'], hide: '.cookiefirst-root' },
    { name: 'Shopify', detect: '#shopify-pc__banner', reject: ['#shopify-pc__banner__btn-decline'], hide: '#shopify-pc__banner' },
  ];
  const REJECT_WORDS = /^(reject( all)?|decline( all)?|deny( all)?|refuse( all)?|only (necessary|essential)( cookies)?|necessary only|essential only|continue without accepting|do not consent|disagree|tout refuser|refuser|ablehnen|alle ablehnen|rechazar( todo)?|rifiuta( tutto)?|weigeren|odrzuć|reddet|отклонить|رفض( الكل)?|رفض جميع ملفات تعريف الارتباط|الضرورية فقط)$/i;
  let consentDone = false, consentTries = 0;
  function clickable(el) { return el && el.offsetParent !== null && !el.disabled; }
  function tryConsent(extraRules) {
    if (consentDone || ++consentTries > 40) return;
    for (const r of [...extraRules, ...CMP]) {
      let root = document;
      if (r.shadow) { const host = document.querySelector(r.shadow); if (host?.shadowRoot) root = host.shadowRoot; }
      let detected = false;
      try { detected = !!(document.querySelector(r.detect) || (root !== document && root.querySelector('*'))); } catch { continue; }
      if (!detected) continue;
      for (const sel of r.reject) {
        let btn = null;
        try { btn = root.querySelector(sel); } catch { /* ignore */ }
        // known CMP buttons are clicked even when our cosmetic filters already hid the banner
        if (btn && !btn.disabled) {
          btn.click(); consentDone = true;
          send({ type: 'consent:handled', cmp: r.name });
          setTimeout(() => { try { document.querySelectorAll(r.hide).forEach(e => e.remove()); } catch { /* ignore */ } restoreScroll(); }, 800);
          return;
        }
      }
    }
    // heuristic: a visible "Reject all" button inside a cookie/consent container
    const containers = document.querySelectorAll('[id*="cookie" i],[class*="cookie" i],[id*="consent" i],[class*="consent" i],[id*="gdpr" i],[class*="gdpr" i],[aria-label*="cookie" i],[role="dialog"]');
    for (const c of containers) {
      if (c.offsetParent === null && getComputedStyle(c).position !== 'fixed') continue;
      if (!/cookie|consent|gdpr|privacy|خصوصية|ملفات تعريف/i.test(c.textContent || '')) continue;
      for (const b of c.querySelectorAll('button,a[role="button"],[role="button"],input[type="button"]')) {
        const label = (b.innerText || b.value || b.getAttribute('aria-label') || '').trim().replace(/\s+/g, ' ');
        if (label.length < 40 && REJECT_WORDS.test(label) && clickable(b)) {
          b.click(); consentDone = true; send({ type: 'consent:handled', cmp: 'heuristic' }); restoreScroll(); return;
        }
      }
    }
  }
  function restoreScroll() {
    for (const el of [document.documentElement, document.body]) {
      if (!el) continue;
      if (getComputedStyle(el).overflow === 'hidden') el.style.setProperty('overflow', 'auto', 'important');
    }
  }

  // -------------------------------------------------------------------------
  // abp:subscribe links
  // -------------------------------------------------------------------------
  document.addEventListener('click', e => {
    const a = e.target?.closest?.('a[href^="abp:"], a[href^="https://subscribe.adblockplus.org"]');
    if (!a) return;
    let loc = null, title = '';
    try {
      const u = new URL(a.href.replace(/^abp:subscribe/, 'https://x/subscribe'));
      loc = u.searchParams.get('location'); title = u.searchParams.get('title') || '';
    } catch { return; }
    if (!loc) return;
    e.preventDefault(); e.stopPropagation();
    send({ type: 'subscribe:add', url: loc, title });
  }, true);

  // -------------------------------------------------------------------------
  // Boot
  // -------------------------------------------------------------------------
  send({ type: 'frame:init', url: location.href }).then(async cfg => {
    if (!cfg || cfg.mode === 'off') return;
    if (cfg.mode !== 'basic' && cfg.cosmetic) {
      procedural = (cfg.procedural || []).map(parseProcedural);
      const observer = new MutationObserver(muts => {
        for (const m of muts) {
          if (m.type === 'attributes') { if (cfg.generic) collect(m.target); continue; }
          for (const n of m.addedNodes) if (n.nodeType === 1 && cfg.generic) scan(n);
        }
        if (cfg.generic) schedule();
        scheduleProcedural();
      });
      const start = () => {
        if (cfg.generic) scan(document.documentElement);
        scheduleProcedural();
        observer.observe(document.documentElement, { childList: true, subtree: true, attributes: cfg.generic, attributeFilter: ['class', 'id'] });
      };
      if (document.documentElement) start(); else document.addEventListener('readystatechange', start, { once: true });
      document.addEventListener('DOMContentLoaded', () => { if (cfg.generic) scan(document.documentElement); scheduleProcedural(); }, { once: true });
    }
    if (cfg.autoConsent && window === window.top) {
      let extra = [];
      try { const { remoteExtras } = await api.storage.local.get('remoteExtras'); extra = remoteExtras?.consentRules || []; } catch { /* ignore */ }
      const run = () => tryConsent(extra);
      const iv = setInterval(() => { run(); if (consentDone || consentTries > 40) clearInterval(iv); }, 500);
      setTimeout(() => clearInterval(iv), 20000);
    }
  });
})();
