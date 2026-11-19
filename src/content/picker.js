// Wipe Ad — element picker ("pick": create a hiding filter) and zapper ("zap": remove temporarily)
(() => {
  'use strict';
  const mode = window.__wipeAdPickerMode || 'pick';
  if (window.__wipeAdPickerActive) { window.__wipeAdPickerActive(); }
  const isAr = (navigator.language || '').startsWith('ar');
  const T = isAr ? {
    pickTitle: 'اختر العنصر المراد حجبه', zapTitle: 'انقر على أي عنصر لإزالته — Esc للخروج',
    create: 'إنشاء فلتر', cancel: 'إلغاء', preview: 'معاينة', matches: 'عنصر مطابق', more: 'أعم', less: 'أدق', done: 'تم حفظ الفلتر ✓',
  } : {
    pickTitle: 'Pick the element to block', zapTitle: 'Click any element to remove it — Esc to exit',
    create: 'Create filter', cancel: 'Cancel', preview: 'Preview', matches: 'matching element(s)', more: 'Broader', less: 'Narrower', done: 'Filter saved ✓',
  };

  const host = document.createElement('wipe-ad-picker');
  host.style.cssText = 'all:initial;position:fixed;inset:0;z-index:2147483647;pointer-events:none;';
  const root = host.attachShadow({ mode: 'closed' });
  root.innerHTML = `
  <style>
    :host{all:initial}
    .hl{position:fixed;pointer-events:none;background:rgba(124,58,237,.25);outline:2px solid #7c3aed;border-radius:3px;transition:all .05s;display:none}
    .bar{position:fixed;${isAr ? 'left' : 'right'}:16px;bottom:16px;width:360px;max-width:calc(100vw - 32px);pointer-events:auto;font:13px/1.5 system-ui,-apple-system,"Segoe UI",Tahoma,sans-serif;
      background:#111827;color:#f9fafb;border-radius:14px;box-shadow:0 12px 40px rgba(0,0,0,.45);padding:14px;direction:${isAr ? 'rtl' : 'ltr'}}
    .t{font-weight:700;margin-bottom:8px;display:flex;align-items:center;gap:8px}
    .t i{width:10px;height:10px;border-radius:50%;background:linear-gradient(135deg,#7c3aed,#06b6d4)}
    textarea{width:100%;box-sizing:border-box;height:64px;border-radius:8px;border:1px solid #374151;background:#030712;color:#e5e7eb;font:12px ui-monospace,Consolas,monospace;padding:8px;direction:ltr;resize:vertical}
    .row{display:flex;gap:8px;margin-top:10px;align-items:center;flex-wrap:wrap}
    button{border:0;border-radius:8px;padding:7px 12px;font:inherit;font-weight:600;cursor:pointer;background:#374151;color:#fff}
    button.p{background:linear-gradient(135deg,#7c3aed,#2563eb)}
    .n{color:#9ca3af;font-size:12px;margin-inline-start:auto}
    input[type=range]{flex:1}
  </style>
  <div class="hl"></div>
  <div class="bar" style="display:none">
    <div class="t"><i></i><span class="title"></span></div>
    <textarea spellcheck="false"></textarea>
    <div class="row"><span>${T.less}</span><input type="range" min="0" max="0" value="0"><span>${T.more}</span></div>
    <div class="row"><button class="p create">${T.create}</button><button class="prev">${T.preview}</button><button class="cancel">${T.cancel}</button><span class="n"></span></div>
  </div>`;
  document.documentElement.appendChild(host);
  const hl = root.querySelector('.hl'), bar = root.querySelector('.bar'), ta = root.querySelector('textarea');
  const range = root.querySelector('input'), count = root.querySelector('.n');
  root.querySelector('.title').textContent = mode === 'zap' ? T.zapTitle : T.pickTitle;
  if (mode === 'zap') { bar.style.display = 'block'; root.querySelector('textarea').remove(); root.querySelectorAll('.row').forEach(r => r.remove()); }

  let target = null, picked = null, candidates = [], previewStyle = null;

  function elementAt(x, y) {
    host.style.display = 'none';
    const el = document.elementFromPoint(x, y);
    host.style.display = '';
    return el && el !== document.documentElement && el !== document.body ? el : null;
  }
  function highlight(el) {
    if (!el) { hl.style.display = 'none'; return; }
    const r = el.getBoundingClientRect();
    Object.assign(hl.style, { display: 'block', left: r.left + 'px', top: r.top + 'px', width: r.width + 'px', height: r.height + 'px' });
  }
  const esc = s => CSS.escape(s);
  const goodClass = c => c && !/^\d|[0-9a-f]{6,}|^(active|hover|focus|open|show|visible|selected)$/i.test(c) && c.length < 40;
  function selectorFor(el) {
    if (el.id && !/\d{3,}/.test(el.id) && document.querySelectorAll('#' + esc(el.id)).length === 1) return '#' + esc(el.id);
    let s = el.localName;
    const cls = [...el.classList].filter(goodClass).slice(0, 3);
    if (cls.length) s += cls.map(c => '.' + esc(c)).join('');
    for (const a of ['data-ad', 'data-testid', 'aria-label', 'role', 'name']) {
      const v = el.getAttribute(a);
      if (v && v.length < 50 && !cls.length) { s += `[${a}="${v.replace(/"/g, '\\"')}"]`; break; }
    }
    if (el.localName === 'a' && el.getAttribute('href')?.startsWith('http') && !cls.length) {
      try { s += `[href^="${new URL(el.href).origin}"]`; } catch { /* ignore */ }
    }
    if (el.localName === 'iframe' && el.src) { try { s += `[src*="${new URL(el.src).hostname}"]`; } catch { /* ignore */ } }
    return s;
  }
  function buildCandidates(el) {
    const list = [];
    let cur = el, path = [];
    for (let depth = 0; cur && cur !== document.body && depth < 6; depth++, cur = cur.parentElement) {
      const sel = selectorFor(cur);
      path.unshift(sel);
      list.push({ el: cur, sel: sel.startsWith('#') ? sel : (depth === 0 ? sel : path.join(' > ')) });
      if (sel.startsWith('#')) break;
    }
    // simplest standalone selectors for the element itself first
    return list.map(c => c.sel === selectorFor(c.el) ? c : c).reduce((acc, c) => (acc.some(x => x.sel === c.sel) ? acc : [...acc, c]), []);
  }
  function countMatches(sel) { try { return document.querySelectorAll(sel).length; } catch { return 0; } }
  function updateCount() {
    const n = countMatches(ta.value.trim());
    count.textContent = `${n} ${T.matches}`;
    try { highlight(document.querySelector(ta.value.trim())); } catch { /* ignore */ }
  }

  function onMove(e) { if (picked) return; target = elementAt(e.clientX, e.clientY); highlight(target); }
  function onClick(e) {
    if (e.composedPath().includes(bar)) return;
    e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
    const el = elementAt(e.clientX, e.clientY);
    if (!el) return;
    if (mode === 'zap') { el.remove(); highlight(null); return; }
    picked = el;
    candidates = buildCandidates(el);
    range.max = String(Math.max(0, candidates.length - 1));
    range.value = '0';
    ta.value = candidates[0]?.sel || selectorFor(el);
    bar.style.display = 'block';
    updateCount();
  }
  function stop() {
    document.removeEventListener('mousemove', onMove, true);
    document.removeEventListener('click', onClick, true);
    document.removeEventListener('keydown', onKey, true);
    previewStyle?.remove();
    host.remove();
    window.__wipeAdPickerActive = null;
  }
  function onKey(e) { if (e.key === 'Escape') { e.preventDefault(); stop(); } }
  window.__wipeAdPickerActive = stop;

  range.addEventListener('input', () => { ta.value = candidates[+range.value]?.sel || ta.value; updateCount(); });
  ta.addEventListener('input', updateCount);
  root.querySelector('.cancel')?.addEventListener('click', stop);
  root.querySelector('.prev')?.addEventListener('click', () => {
    if (previewStyle) { previewStyle.remove(); previewStyle = null; return; }
    previewStyle = document.createElement('style');
    previewStyle.textContent = `${ta.value.trim()}{display:none!important}`;
    document.documentElement.appendChild(previewStyle);
  });
  root.querySelector('.create')?.addEventListener('click', () => {
    const selector = ta.value.trim();
    if (!selector || !countMatches(selector)) return;
    chrome.runtime.sendMessage({ type: 'picker:create', selector, host: location.hostname }, () => {
      void chrome.runtime.lastError;
      count.textContent = T.done;
      setTimeout(stop, 700);
    });
  });
  document.addEventListener('mousemove', onMove, true);
  document.addEventListener('click', onClick, true);
  document.addEventListener('keydown', onKey, true);
})();
