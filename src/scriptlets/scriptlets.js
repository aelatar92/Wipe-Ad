// Wipe Ad — scriptlets. This function is serialized and executed in the page's MAIN world,
// so it must be fully self-contained (no imports, no outer variables).

export function wipeAdScriptlets(list) {
  'use strict';
  // Several injections can reach the same page (registered at document_start + executeScript
  // for user / live rules): apply each scriptlet only once per document.
  const KEY = Symbol.for('wipead.scriptlets');
  let applied = window[KEY];
  if (!applied) {
    applied = new Set();
    try { Object.defineProperty(window, KEY, { value: applied }); } catch { return; }
  }
  list = list.filter(item => { const sig = JSON.stringify(item); if (applied.has(sig)) return false; applied.add(sig); return true; });
  if (!list.length) return;

  const toRegex = (s) => {
    if (s === undefined || s === '' || s === '*') return /^/;
    const m = /^\/(.+)\/([gimsu]*)$/.exec(s);
    if (m) { try { return new RegExp(m[1], m[2]); } catch { return /^\b$/; } }
    return new RegExp(s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  };
  const notMatch = (s) => { // "!pattern" support
    if (typeof s === 'string' && s.startsWith('!')) { const r = toRegex(s.slice(1)); return { test: x => !r.test(x) }; }
    return toRegex(s);
  };
  const parseValue = (v) => {
    switch (v) {
      case 'undefined': return undefined; case 'null': return null; case 'true': return true; case 'false': return false;
      case 'noopFunc': case 'noop': return function () {}; case 'trueFunc': return () => true; case 'falseFunc': return () => false;
      case 'emptyArr': case '[]': return []; case 'emptyObj': case '{}': return {}; case "''": case 'emptyStr': case '': return '';
      case 'throwFunc': return () => { throw new Error(); };
      case 'noopPromiseResolve': return () => Promise.resolve(); case 'noopPromiseReject': return () => Promise.reject();
      case '-1': return -1; case 'NaN': return NaN; case 'Infinity': return Infinity;
    }
    if (/^-?\d+(\.\d+)?$/.test(v)) { const n = Number(v); if (Math.abs(n) <= 0x7fff) return n; }
    return undefined;
  };
  const magic = 'wipead' + Math.random().toString(36).slice(2);
  const onError = (e) => { if (typeof e?.message === 'string' && e.message.includes(magic)) e.preventDefault?.(); };
  window.addEventListener('error', onError, true);
  const abort = () => { throw new ReferenceError(magic); };

  // walk "a.b.c" and trap the last property
  const trapChain = (chain, onGet, onSet) => {
    const parts = chain.split('.');
    const trap = (owner, i) => {
      const prop = parts[i];
      if (i === parts.length - 1) {
        let value = owner[prop];
        try {
          Object.defineProperty(owner, prop, {
            configurable: true,
            get() { return onGet ? onGet(value) : value; },
            set(v) { if (onSet) value = onSet(v); else value = v; },
          });
        } catch { /* non-configurable */ }
        return;
      }
      let child = owner[prop];
      if (child instanceof Object) { trap(child, i + 1); return; }
      try {
        Object.defineProperty(owner, prop, {
          configurable: true,
          get() { return child; },
          set(v) { child = v; if (v instanceof Object) trap(v, i + 1); },
        });
      } catch { /* ignore */ }
    };
    trap(window, 0);
  };

  const S = {
    'set-constant'(chain, raw) {
      const value = parseValue(raw);
      if (value === undefined && raw !== 'undefined') return;
      trapChain(chain, () => value, () => value);
    },
    'abort-on-property-read'(chain) { trapChain(chain, abort, null); },
    'abort-on-property-write'(chain) { trapChain(chain, null, abort); },
    'abort-current-script'(chain, needle) {
      const re = toRegex(needle);
      const thisScript = document.currentScript;
      const check = () => {
        const s = document.currentScript;
        if (!(s instanceof HTMLScriptElement) || s === thisScript) return;
        const text = s.src ? s.src : s.textContent;
        if (needle && !re.test(text)) return;
        abort();
      };
      trapChain(chain, v => { check(); return v; }, v => { check(); return v; });
    },
    'json-prune'(paths, required) {
      const prune = (paths || '').split(/ +/).filter(Boolean);
      const req = (required || '').split(/ +/).filter(Boolean);
      const has = (o, p) => p.split('.').reduce((a, k) => (a && typeof a === 'object' && k in a) ? a[k] : undefined, o) !== undefined;
      const del = (o, p) => {
        const ks = p.split('.');
        const walk = (node, i) => {
          if (!node || typeof node !== 'object') return;
          const k = ks[i];
          if (k === '[]') { for (const v of Object.values(node)) walk(v, i + 1); return; }
          if (i === ks.length - 1) { delete node[k]; return; }
          walk(node[k], i + 1);
        };
        walk(o, 0);
      };
      const fix = (obj) => {
        try { if (req.length && !req.every(p => has(obj, p))) return obj; prune.forEach(p => del(obj, p)); } catch { /* ignore */ }
        return obj;
      };
      const origParse = JSON.parse;
      JSON.parse = new Proxy(origParse, { apply(t, th, a) { return fix(Reflect.apply(t, th, a)); } });
      const origJson = Response.prototype.json;
      Response.prototype.json = new Proxy(origJson, { apply(t, th, a) { return Reflect.apply(t, th, a).then(fix); } });
    },
    // shared JSON pruner used by the fetch / XHR response variants
    _pruner(paths, required) {
      const prune = (paths || '').split(/ +/).filter(Boolean);
      const req = (required || '').split(/ +/).filter(Boolean);
      const get = (o, p) => p.split('.').reduce((a, k) => (a && typeof a === 'object' && k in a) ? a[k] : undefined, o);
      const del = (o, p) => {
        const ks = p.split('.');
        const walk = (node, i) => {
          if (!node || typeof node !== 'object') return;
          const k = ks[i];
          if (k === '[]') { for (const v of Object.values(node)) walk(v, i + 1); return; }
          if (i === ks.length - 1) { delete node[k]; return; }
          walk(node[k], i + 1);
        };
        walk(o, 0);
      };
      return (obj) => {
        try { if (req.length && !req.every(p => get(obj, p) !== undefined)) return obj; prune.forEach(p => del(obj, p)); } catch { /* ignore */ }
        return obj;
      };
    },
    _urlMatcher(rest) {
      // uBO style trailing args: "propsToMatch", "<url pattern>"
      const i = rest.indexOf('propsToMatch');
      const pat = i >= 0 ? rest[i + 1] : '';
      const re = toRegex((pat || '').replace(/^url:/, ''));
      return url => !pat || re.test(url);
    },
    'json-prune-fetch-response'(paths, required, ...rest) {
      const fix = this._pruner(paths, required), match = this._urlMatcher(rest);
      window.fetch = new Proxy(window.fetch, { apply(t, th, a) {
        const url = a[0] instanceof Request ? a[0].url : String(a[0]);
        const p = Reflect.apply(t, th, a);
        if (!match(url)) return p;
        return p.then(res => res.clone().text().then(text => {
          let obj; try { obj = JSON.parse(text); } catch { return res; }
          return new Response(JSON.stringify(fix(obj)), { status: res.status, statusText: res.statusText, headers: res.headers });
        }).catch(() => res));
      } });
    },
    'json-prune-xhr-response'(paths, required, ...rest) {
      const fix = this._pruner(paths, required), match = this._urlMatcher(rest);
      const open = XMLHttpRequest.prototype.open;
      XMLHttpRequest.prototype.open = function (m, u, ...r) { this.__waPrune = match(String(u)); return open.call(this, m, u, ...r); };
      for (const prop of ['response', 'responseText']) {
        const desc = Object.getOwnPropertyDescriptor(XMLHttpRequest.prototype, prop);
        if (!desc?.get) continue;
        Object.defineProperty(XMLHttpRequest.prototype, prop, { configurable: true, get() {
          const v = desc.get.call(this);
          if (!this.__waPrune || this.readyState !== 4) return v;
          try {
            if (typeof v === 'string') return JSON.stringify(fix(JSON.parse(v)));
            if (v && typeof v === 'object') return fix(v);
          } catch { /* not JSON */ }
          return v;
        } });
      }
    },
    'auto-click'(selectors, maxMs) {
      const list = (selectors || '').split(',').map(s => s.trim()).filter(Boolean);
      const tick = () => { for (const s of list) { try { document.querySelectorAll(s).forEach(el => { if (el.offsetParent !== null) el.click(); }); } catch { /* ignore */ } } };
      const mo = new MutationObserver(tick);
      const start = () => { mo.observe(document.documentElement, { childList: true, subtree: true }); tick(); };
      if (document.documentElement) start(); else document.addEventListener('DOMContentLoaded', start, { once: true });
      if (maxMs) setTimeout(() => mo.disconnect(), parseInt(maxMs, 10));
    },
    // YouTube: skip / fast-forward video ads that slip through the JSON pruning
    'wipead-youtube'() {
      const SKIP = '.ytp-ad-skip-button, .ytp-ad-skip-button-modern, .ytp-skip-ad-button, button[id^="skip-button"]';
      const check = () => {
        const player = document.querySelector('.html5-video-player');
        if (!player) return;
        document.querySelectorAll(SKIP).forEach(b => b.click());
        if (player.classList.contains('ad-showing') || player.classList.contains('ad-interrupting')) {
          const v = player.querySelector('video');
          if (v && Number.isFinite(v.duration) && v.duration > 0) { v.muted = true; v.playbackRate = 16; v.currentTime = Math.max(v.currentTime, v.duration - 0.1); }
        }
      };
      const mo = new MutationObserver(check);
      const start = () => { mo.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] }); check(); };
      if (document.documentElement) start(); else document.addEventListener('DOMContentLoaded', start, { once: true });
      setInterval(check, 500);
    },
    'no-setTimeout-if'(needle, delay) { this._timer('setTimeout', needle, delay); },
    'no-setInterval-if'(needle, delay) { this._timer('setInterval', needle, delay); },
    _timer(fn, needle, delay) {
      const re = notMatch(needle || '');
      const d = delay !== undefined && delay !== '' ? parseInt(String(delay).replace('!', ''), 10) : null;
      const negDelay = String(delay || '').startsWith('!');
      window[fn] = new Proxy(window[fn], {
        apply(t, th, a) {
          const code = String(a[0]); const ms = a[1] | 0;
          const delayOk = d === null || (negDelay ? ms !== d : ms === d);
          if (re.test(code) && delayOk) return 0;
          return Reflect.apply(t, th, a);
        },
      });
    },
    'adjust-setTimeout'(needle, delay, boost) { this._adjust('setTimeout', needle, delay, boost); },
    'adjust-setInterval'(needle, delay, boost) { this._adjust('setInterval', needle, delay, boost); },
    _adjust(fn, needle, delay, boost) {
      const re = toRegex(needle || ''); const d = delay ? parseInt(delay, 10) : 1000; const b = boost ? parseFloat(boost) : 0.05;
      window[fn] = new Proxy(window[fn], { apply(t, th, a) {
        if ((a[1] | 0) === d && re.test(String(a[0]))) a[1] = d * b;
        return Reflect.apply(t, th, a);
      } });
    },
    'prevent-addEventListener'(type, needle) {
      const tr = notMatch(type || ''), nr = notMatch(needle || '');
      const orig = EventTarget.prototype.addEventListener;
      EventTarget.prototype.addEventListener = new Proxy(orig, { apply(t, th, a) {
        let h = '';
        try { h = typeof a[1] === 'function' ? a[1].toString() : String(a[1]?.handleEvent || ''); } catch { /* ignore */ }
        if (tr.test(String(a[0])) && nr.test(h)) return undefined;
        return Reflect.apply(t, th, a);
      } });
    },
    'no-fetch-if'(conds) {
      const parts = (conds || '').split(/\s+/).filter(Boolean).map(p => {
        const i = p.indexOf(':'); return i > 0 && !p.startsWith('/') ? [p.slice(0, i), toRegex(p.slice(i + 1))] : ['url', toRegex(p)];
      });
      const orig = window.fetch;
      window.fetch = new Proxy(orig, { apply(t, th, a) {
        const req = a[0] instanceof Request ? a[0] : null;
        const props = { url: req ? req.url : String(a[0]), method: (req?.method || a[1]?.method || 'GET') };
        if (parts.length === 0 || parts.every(([k, r]) => r.test(String(props[k] ?? '')))) {
          return Promise.resolve(new Response('', { status: 200, statusText: 'OK' }));
        }
        return Reflect.apply(t, th, a);
      } });
    },
    'no-xhr-if'(conds) {
      const re = toRegex((conds || '').replace(/^url:/, ''));
      const open = XMLHttpRequest.prototype.open, send = XMLHttpRequest.prototype.send;
      XMLHttpRequest.prototype.open = function (m, u, ...rest) { this.__wa = re.test(String(u)); return open.call(this, m, u, ...rest); };
      XMLHttpRequest.prototype.send = function (...a) {
        if (!this.__wa) return send.apply(this, a);
        Object.defineProperties(this, { readyState: { value: 4 }, status: { value: 200 }, responseText: { value: '' }, response: { value: '' } });
        setTimeout(() => { this.dispatchEvent(new Event('readystatechange')); this.dispatchEvent(new Event('load')); this.dispatchEvent(new Event('loadend')); }, 1);
      };
    },
    'remove-attr'(attrs, selector) { this._dom(() => {
      const names = (attrs || '').split(/\s*\|\s*/).filter(Boolean);
      const sel = selector || names.map(n => `[${CSS.escape(n)}]`).join(',');
      document.querySelectorAll(sel).forEach(el => names.forEach(n => el.removeAttribute(n)));
    }); },
    'remove-class'(classes, selector) { this._dom(() => {
      const names = (classes || '').split(/\s*\|\s*/).filter(Boolean);
      const sel = selector || names.map(n => '.' + CSS.escape(n)).join(',');
      document.querySelectorAll(sel).forEach(el => el.classList.remove(...names));
    }); },
    'remove-node-text'(nodeName, needle) {
      const nn = toRegex(nodeName), re = toRegex(needle);
      const scan = (root) => {
        const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
        let n; while ((n = w.nextNode())) {
          if (n.nodeType === 3 && nn.test(n.parentNode?.nodeName?.toLowerCase() || '') && re.test(n.textContent)) n.textContent = '';
          else if (n.nodeType === 1 && n.nodeName === 'SCRIPT' && nn.test('script') && re.test(n.textContent)) n.textContent = '';
        }
      };
      new MutationObserver(ms => ms.forEach(m => m.addedNodes.forEach(x => { if (x.nodeType === 1 || x.nodeType === 3) scan(x.nodeType === 3 ? x.parentNode || document : x); })))
        .observe(document, { childList: true, subtree: true });
    },
    'no-window-open-if'(needle) {
      const re = notMatch(needle || '');
      window.open = new Proxy(window.open, { apply(t, th, a) {
        if (re.test(String(a[0] || ''))) {
          return new Proxy({}, { get: (o, k) => (k === 'closed' ? false : (typeof Window.prototype[k] === 'function' ? () => {} : undefined)) });
        }
        return Reflect.apply(t, th, a);
      } });
    },
    'set-cookie'(name, value, path) {
      const v = parseValue(value);
      const ok = ['true', 'false', 'yes', 'no', 'y', 'n', 'ok', 'on', 'off', 'accept', 'reject', 'allow', 'deny', '0', '1', ''];
      if (!ok.includes(String(value).toLowerCase()) && typeof v !== 'number') return;
      document.cookie = `${encodeURIComponent(name)}=${encodeURIComponent(value)}; path=${path || '/'}; max-age=31536000`;
    },
    'set-local-storage-item'(k, v) { try { if (v === '$remove$') localStorage.removeItem(k); else localStorage.setItem(k, String(parseValue(v) ?? v)); } catch { /* ignore */ } },
    'set-session-storage-item'(k, v) { try { if (v === '$remove$') sessionStorage.removeItem(k); else sessionStorage.setItem(k, String(parseValue(v) ?? v)); } catch { /* ignore */ } },
    noeval() { window.eval = new Proxy(window.eval, { apply() { return undefined; } }); },
    'noeval-if'(needle) { const re = toRegex(needle); window.eval = new Proxy(window.eval, { apply(t, th, a) { if (re.test(String(a[0]))) return undefined; return Reflect.apply(t, th, a); } }); },
    'disable-newtab-links'() { document.addEventListener('click', e => { const a = e.target.closest?.('a[target="_blank"]'); if (a) { e.stopPropagation(); a.removeAttribute('target'); } }, true); },
    'prevent-refresh'() { this._dom(() => document.querySelectorAll('meta[http-equiv="refresh" i]').forEach(m => m.remove())); },
    'href-sanitizer'(selector, source) { this._dom(() => {
      document.querySelectorAll(selector).forEach(a => {
        let v = source ? (source.startsWith('[') ? a.getAttribute(source.slice(1, -1)) : a.textContent) : a.textContent;
        if (source === '?url' || source === '?u') { try { v = new URL(a.href).searchParams.get(source.slice(1)); } catch { v = null; } }
        if (v && /^https?:\/\//.test(v.trim())) a.href = v.trim();
      });
    }); },
    'click-element'(selectors) { const list = (selectors || '').split(',').map(s => s.trim()).filter(Boolean); let i = 0;
      const tick = () => { const el = list[i] && document.querySelector(list[i]); if (el) { el.click(); i++; } if (i < list.length) setTimeout(tick, 400); };
      setTimeout(tick, 600); setTimeout(() => { i = list.length; }, 10000);
    },
    _dom(fn) {
      const run = () => { try { fn(); } catch { /* ignore */ } };
      if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run, { once: true }); else run();
      let n = 0; const mo = new MutationObserver(() => { if (++n > 200) { mo.disconnect(); return; } run(); });
      mo.observe(document, { childList: true, subtree: true });
      setTimeout(() => mo.disconnect(), 20000);
    },
  };

  for (const [name, ...args] of list) {
    const fn = S[name];
    if (typeof fn !== 'function' || name.startsWith('_')) continue;
    try { fn.apply(S, args); } catch (e) { /* keep going */ }
  }
}
