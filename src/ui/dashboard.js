import { initI18n, t, send, fmtNum, fmtDate, el } from './i18n.js';

const $ = id => document.getElementById(id);
let settings = {};

// ---------------------------------------------------------------------------
// Navigation
// ---------------------------------------------------------------------------
const loaders = {};
function show(sec) {
  document.querySelectorAll('main > section').forEach(s => { s.hidden = s.id !== 'sec-' + sec; });
  document.querySelectorAll('#nav a').forEach(a => a.classList.toggle('active', a.dataset.sec === sec));
  loaders[sec]?.();
}
document.querySelectorAll('#nav a').forEach(a => a.onclick = () => { history.replaceState(null, '', '#' + a.dataset.sec); show(a.dataset.sec); });

// ---------------------------------------------------------------------------
// Generic settings binding: <input data-setting="key">
// ---------------------------------------------------------------------------
function bindSettings(root = document) {
  root.querySelectorAll('[data-setting]').forEach(inp => {
    const key = inp.dataset.setting;
    if (inp.type === 'checkbox') inp.checked = !!settings[key]; else inp.value = settings[key] ?? '';
    if (inp.__bound) return;
    inp.__bound = true;
    inp.addEventListener('change', async () => {
      let v = inp.type === 'checkbox' ? inp.checked : inp.value;
      if (inp.type === 'number' || inp.dataset.num) v = Number(v);
      if (inp.dataset.permission && v) {
        const granted = await chrome.permissions.request({ permissions: [inp.dataset.permission] }).catch(() => false);
        if (!granted) { inp.checked = false; return; }
      }
      settings = await send({ type: 'settings:set', patch: { [key]: v } });
      if (key === 'language') location.reload();
    });
  });
}

// ---------------------------------------------------------------------------
// Overview
// ---------------------------------------------------------------------------
loaders.overview = async () => {
  const tot = await send({ type: 'stats:totals' });
  const c = tot.byCategory || {};
  $('stBlocked').textContent = fmtNum(tot.blocked);
  $('stAds').textContent = fmtNum(c.a);
  $('stTrackers').textContent = fmtNum(c.t);
  $('stMalware').textContent = fmtNum(c.m);
  $('stBanners').textContent = fmtNum(tot.cookieBanners);
  $('stSince').textContent = fmtDate(tot.since);
  const max = Math.max(1, ...Object.values(c));
  $('bars').replaceChildren(...['a', 't', 'm', 'n', 's', 'o'].map(k => el('div', { class: 'bar' },
    el('span', {}, t('cat_' + k)), el('div', { class: 'track' }, el('div', { class: 'fill', style: `width:${((c[k] || 0) / max) * 100}%` })), el('b', {}, fmtNum(c[k])))));
};
$('resetStats').onclick = async () => { await send({ type: 'stats:reset' }); loaders.overview(); };

// ---------------------------------------------------------------------------
// Filter lists
// ---------------------------------------------------------------------------
loaders.lists = async () => {
  const { lists, counts, custom } = await send({ type: 'rulesets:list' });
  const groups = ['ads', 'privacy', 'malware', 'annoyances', 'regions'];
  const box = $('lists');
  box.replaceChildren();
  for (const g of groups) {
    const items = lists.filter(l => l.group === g);
    if (!items.length) continue;
    box.append(el('div', { class: 'group' }, el('h3', {}, t('group_' + g)), ...items.map(l => {
      const cb = el('input', { type: 'checkbox' });
      cb.checked = l.on;
      cb.onchange = async () => {
        cb.disabled = true;
        const r = await send({ type: 'rulesets:set', id: l.id, on: cb.checked });
        cb.disabled = false;
        showBudget(r.counts);
      };
      return el('div', { class: 'list' },
        el('div', { class: 'meta' }, el('b', {}, l.name),
          el('div', { class: 'small' }, `${fmtNum(l.rules)} ${t('rules')} · ${fmtNum(l.cosmeticCount || 0)} ${t('cosmeticRules')} · `, el('a', { href: l.home, target: '_blank' }, t('listHome')))),
        el('label', { class: 'switch' }, cb, el('span')));
    })));
  }
  showBudget(counts);
  const cbox = $('customs');
  cbox.replaceChildren(...(settings.customLists || []).map(l => {
    const st = custom[l.url];
    return el('div', { class: 'item' }, el('code', { title: l.url }, l.title || l.url),
      el('span', { class: 'muted' }, st ? (st.error ? '⚠ ' + st.error : `${fmtNum(st.lines)} · ${fmtDate(st.fetched)}`) : '…'),
      el('button', { class: 'mini danger', onclick: async () => { await send({ type: 'subscribe:remove', url: l.url }); settings = await send({ type: 'settings:get' }); loaders.lists(); } }, t('removeList')));
  }));
};
function showBudget(c) {
  $('budget').textContent = `static: ${c.enabledRulesets.length} lists${c.availableStatic != null ? ` · ${fmtNum(c.availableStatic)} free` : ''} · dynamic: ${fmtNum(c.dynamic)} (user ${c.user}, live ${c.remote}, learned ${c.learning}, stealth ${c.stealth})`;
}
$('addCustom').onclick = async () => {
  const url = $('customUrl').value.trim();
  if (!url) return;
  const r = await send({ type: 'subscribe:add', url, title: '' });
  if (r?.error) alert(r.error);
  $('customUrl').value = '';
  settings = await send({ type: 'settings:get' });
  setTimeout(loaders.lists, 1500);
};

// ---------------------------------------------------------------------------
// My filters
// ---------------------------------------------------------------------------
loaders.myfilters = async () => { $('userFilters').value = (await send({ type: 'userFilters:get' })).text; };
function statsText(s) { return `${fmtNum(s.total - s.unsupported)} ${t('accepted')} · ${fmtNum(s.unsupported)} ${t('unsupported')} · ${fmtNum(s.rules)} DNR`; }
$('saveFilters').onclick = async () => {
  const r = await send({ type: 'userFilters:set', text: $('userFilters').value });
  $('filtersMsg').textContent = r.error ? r.error : `${t('saved')} — ${statsText(r.stats)}`;
};
$('testFilters').onclick = async () => { $('filtersMsg').textContent = statsText(await send({ type: 'userFilters:test', text: $('userFilters').value })); };

// ---------------------------------------------------------------------------
// Sites
// ---------------------------------------------------------------------------
loaders.sites = () => {
  $('allowlist').value = (settings.allowlist || []).join('\n');
  const modes = Object.entries(settings.siteModes || {});
  $('siteModes').replaceChildren(modes.length ? el('table', {}, ...modes.map(([h, m]) => el('tr', {},
    el('td', { class: 'u' }, h), el('td', {}, t('mode' + m[0].toUpperCase() + m.slice(1))),
    el('td', {}, el('button', { class: 'mini danger', onclick: async () => { const sm = { ...settings.siteModes }; delete sm[h]; settings = await send({ type: 'settings:set', patch: { siteModes: sm } }); loaders.sites(); } }, '✕'))))) : el('div', { class: 'muted small' }, t('noSiteModes')));
};
$('saveAllow').onclick = async () => {
  const list = [...new Set($('allowlist').value.split(/\s+/).map(s => s.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/^www\./, '')).filter(Boolean))];
  settings = await send({ type: 'settings:set', patch: { allowlist: list } });
  $('allowMsg').textContent = t('saved');
  loaders.sites();
};

// ---------------------------------------------------------------------------
// Privacy
// ---------------------------------------------------------------------------
const PRIVACY = [
  ['gpc'], ['stripTrackingParams'], ['hideSearchQueries'], ['hideReferrer'], ['removeXClientData'], ['blockPings'],
  ['autoDeleteTrackerCookies', null, 'clean'], ['stripThirdPartyCookies'], ['blockWebRTC', 'privacy'],
  ['autoConsent'], ['malwareWarning'],
];
const ADVANCED = [['skipRedirects'], ['fpDetect'], ['antiFingerprint'], ['cnameUncloak', null, null, 'cnameHint'], ['serpBadges'], ['weeklyReport']];
const ANNOY = [['blockNotificationPrompts'], ['stopAutoplay'], ['hideNewsletters']];

function optionRows(list) {
  return list.map(([key, perm, , hint]) => {
    const inp = el('input', { type: 'checkbox', 'data-setting': key, ...(perm ? { 'data-permission': perm } : {}) });
    return el('label', { class: 'opt' }, el('span', {}, t(key), hint ? el('div', { class: 'muted small' }, t(hint)) : null), el('label', { class: 'switch' }, inp, el('span')));
  });
}

loaders.privacy = async () => {
  $('advancedOpts').replaceChildren(...optionRows(ADVANCED));
  $('annoyOpts').replaceChildren(...optionRows(ANNOY));
  bindSettings($('advancedOpts')); bindSettings($('annoyOpts'));
  const c = await send({ type: 'cname:state' });
  const n = Object.keys(c.cloaked || {}).length;
  $('cnameInfo').textContent = settings.cnameUncloak ? `${fmtNum(n)} ${t('cnameFound')}${n ? ': ' + Object.keys(c.cloaked).slice(0, 8).join(', ') : ''}` : '';
  renderPrivacy();
};
function renderPrivacy() {
  const box = $('privacyOpts');
  box.replaceChildren(...PRIVACY.map(([key, perm, extra]) => {
    const inp = el('input', { type: 'checkbox', 'data-setting': key, ...(perm ? { 'data-permission': perm } : {}) });
    const label = el('label', { class: 'opt' }, el('span', {}, t(key), perm ? el('div', { class: 'extra' }, t('needsPermission')) : null));
    if (extra === 'clean') {
      const msg = el('span', { class: 'muted small' });
      label.append(el('button', { class: 'mini', onclick: async e => { e.preventDefault(); const r = await send({ type: 'cookies:cleanNow' }); msg.textContent = `${fmtNum(r.removed)} ${t('cookiesRemoved')}`; } }, t('cleanNow')), msg);
    }
    label.append(el('label', { class: 'switch' }, inp, el('span')));
    return label;
  }));
  bindSettings(box);
};

// ---------------------------------------------------------------------------
// Weekly report
// ---------------------------------------------------------------------------
loaders.report = async () => {
  const r = await send({ type: 'report:weekly' });
  $('rBlocked').textContent = fmtNum(r.blocked);
  const diff = r.prevBlocked ? Math.round(((r.blocked - r.prevBlocked) / r.prevBlocked) * 100) : null;
  $('rTrend').textContent = diff === null ? '' : `${diff >= 0 ? '▲' : '▼'} ${Math.abs(diff)}% ${t('vsLastWeek')}`;
  $('rTrend').hidden = diff === null;
  $('rMB').textContent = `${fmtNum(r.savedMB)} ${t('mb')}`;
  $('rTime').textContent = r.savedSeconds >= 120 ? `${fmtNum(Math.round(r.savedSeconds / 60))} ${t('minutes')}` : `${fmtNum(r.savedSeconds)} ${t('seconds')}`;
  $('rTrackers').textContent = fmtNum(r.trackers); $('rAds').textContent = fmtNum(r.ads);
  $('rFp').textContent = fmtNum(r.fingerprinting); $('rSkipped').textContent = fmtNum(r.skipped); $('rBanners').textContent = fmtNum(r.banners);
  const max = Math.max(1, ...r.days.map(d => d.b || 0));
  const lang = document.documentElement.lang === 'ar' ? 'ar-EG' : 'en-US';
  $('rChart').replaceChildren(...r.days.map(d => el('div', { class: 'col' },
    el('span', { class: 'val' }, fmtNum(d.b || 0)),
    el('div', { class: 'bar2', style: `height:${((d.b || 0) / max) * 80}%` }),
    el('span', { class: 'lbl' }, new Date(d.date + 'T12:00').toLocaleDateString(lang, { weekday: 'short' })))));
  const rank = (box, rows) => box.replaceChildren(...(rows.length ? rows.map(([n, c]) => el('li', {}, el('span', {}, n), el('b', {}, fmtNum(c)))) : [el('li', { class: 'muted small' }, t('noData'))]));
  rank($('rTop'), r.topDomains); rank($('rWorst'), r.worstSites);
};

// ---------------------------------------------------------------------------
// Focus & family
// ---------------------------------------------------------------------------
loaders.focus = () => {
  bindSettings($('sec-focus'));
  const f = settings.focus || {};
  $('focusEnabled').checked = !!f.enabled;
  $('focusSites').value = (f.sites || []).join('\n');
  $('focusFrom').value = f.from || '09:00'; $('focusTo').value = f.to || '17:00';
  $('focusAllDay').checked = !!f.allDay;
  const lang = document.documentElement.lang === 'ar' ? 'ar-EG' : 'en-US';
  $('focusDays').replaceChildren(...[0, 1, 2, 3, 4, 5, 6].map(d => {
    const cb = el('input', { type: 'checkbox', value: d });
    cb.checked = (f.days || []).includes(d);
    const name = new Date(2026, 10, 15 + d).toLocaleDateString(lang, { weekday: 'short' }); // 15 Nov 2026 is a Sunday
    return el('label', {}, cb, name);
  }));
  $('focusNow').hidden = !focusOn(f);
};
function focusOn(f) {
  if (!f.enabled || !f.sites?.length) return false;
  const now = new Date();
  if (!(f.days || []).includes(now.getDay())) return false;
  if (f.allDay) return true;
  const m = s => { const [h, mm] = s.split(':').map(Number); return h * 60 + mm; };
  const cur = now.getHours() * 60 + now.getMinutes(), a = m(f.from), b = m(f.to);
  return a <= b ? cur >= a && cur < b : cur >= a || cur < b;
}
async function saveFocus() {
  const focus = {
    enabled: $('focusEnabled').checked,
    sites: [...new Set($('focusSites').value.split(/\s+/).map(s => s.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/^www\./, '')).filter(Boolean))],
    days: [...$('focusDays').querySelectorAll('input:checked')].map(i => Number(i.value)),
    from: $('focusFrom').value || '09:00', to: $('focusTo').value || '17:00', allDay: $('focusAllDay').checked,
  };
  settings = await send({ type: 'settings:set', patch: { focus } });
  $('focusMsg').textContent = t('saved');
  $('focusNow').hidden = !focusOn(focus);
}
$('focusSave').onclick = saveFocus;
$('focusEnabled').onchange = saveFocus;

// ---------------------------------------------------------------------------
// Sync & AI
// ---------------------------------------------------------------------------
async function renderSync() {
  const st = await send({ type: 'sync:status' });
  $('syncLast').textContent = fmtDate(Math.max(st.lastPush || 0, st.lastPull || 0) || null) + (st.error ? ` ⚠ ${st.error}` : '');
}
$('syncNow').onclick = async () => { await send({ type: 'sync:now' }); settings = await send({ type: 'settings:get' }); renderSync(); };
async function renderAI() {
  const st = await send({ type: 'ai:status' });
  $('aiKey').value = settings.aiApiKey ? '••••••••••••' + settings.aiApiKey.slice(-4) : '';
  $('aiKey').disabled = $('aiSave').disabled = !st.available || st.disabled;
  $('aiMsg').textContent = !st.available ? t('aiUnavailable') : st.hasKey ? `${t('aiKeySaved')} · ${st.model}` : '';
}
$('aiSave').onclick = async () => {
  const v = $('aiKey').value.trim();
  if (v.startsWith('••')) return;
  settings = await send({ type: 'settings:set', patch: { aiApiKey: v } });
  renderAI();
};

// ---------------------------------------------------------------------------
// Learning
// ---------------------------------------------------------------------------
let learnRows = [];
loaders.learning = async () => {
  bindSettings($('sec-learning'));
  learnRows = (await send({ type: 'learning:get' })).rows;
  renderLearning();
};
function renderLearning() {
  const q = $('learnFilter').value.trim().toLowerCase();
  const rows = learnRows.filter(r => !q || r.domain.includes(q));
  if (!rows.length) { $('learnTable').replaceChildren(el('div', { class: 'muted small' }, t('learnEmpty'))); return; }
  $('learnTable').replaceChildren(el('table', {},
    el('thead', {}, el('tr', {}, el('th', {}, t('domain')), el('th', {}, t('seenOn')), el('th', {}, t('status')), el('th', {}, t('action')))),
    el('tbody', {}, ...rows.slice(0, 500).map(r => {
      const sel = el('select', {}, ...['default', 'block', 'cookieblock', 'allow'].map(v => el('option', { value: v }, t('act' + v[0].toUpperCase() + v.slice(1)))));
      sel.value = r.user || 'default';
      sel.onchange = async () => { await send({ type: 'learning:set', domain: r.domain, action: sel.value }); r.user = sel.value === 'default' ? null : sel.value; };
      const st = r.user || r.learned;
      return el('tr', {}, el('td', { class: 'u' }, r.domain), el('td', { title: r.sites.join('\n') }, `${r.sites.length} ${t('sites')}`),
        el('td', {}, el('span', { class: 'chip ' + (st === 'block' ? 'cat-m' : st === 'cookieblock' ? 'cat-a' : 'cat-o') }, t('act' + st[0].toUpperCase() + st.slice(1)))), el('td', {}, sel));
    }))));
}
$('learnFilter').oninput = renderLearning;
$('resetLearning').onclick = async () => { if (confirm(t('resetLearning') + '?')) { await send({ type: 'learning:reset' }); loaders.learning(); } };

// ---------------------------------------------------------------------------
// Filtering log (live)
// ---------------------------------------------------------------------------
let port = null, logPaused = false, logTabId = null;
loaders.log = async () => {
  const tabs = await send({ type: 'log:tabs' });
  const sel = $('logTab');
  sel.replaceChildren(el('option', { value: '' }, t('allTabs')), ...tabs.filter(x => x.url).map(x => el('option', { value: x.id }, `${x.host} (${x.blocked})`)));
  if (logTabId !== null) sel.value = String(logTabId);
  await reloadLog();
  if (!port) {
    port = chrome.runtime.connect({ name: 'log' });
    port.onMessage.addListener(m => { if (m.type === 'log' && !logPaused && (logTabId === null || m.tabId === logTabId)) addLogRow(m.entry, true); });
  }
  port.postMessage({ type: 'filter', tabId: logTabId });
};
async function reloadLog() {
  $('logBody').replaceChildren();
  if (logTabId === null) return;
  const entries = await send({ type: 'log:get', tabId: logTabId });
  entries.slice(-500).forEach(e => addLogRow(e, true));
}
function addLogRow(e, prepend) {
  const q = $('logFilter').value.trim().toLowerCase();
  if ($('logOnlyBlocked').checked && e.status !== 'blocked') return;
  if (q && !e.url.toLowerCase().includes(q)) return;
  let host = '';
  try { host = new URL(e.url).hostname; } catch { /* ignore */ }
  const tr = el('tr', { class: 's-' + e.status },
    el('td', {}, new Date(e.time).toLocaleTimeString()), el('td', {}, t('st_' + e.status)), el('td', {}, e.type),
    el('td', {}, e.category ? el('span', { class: 'chip cat-' + e.category }, t('cat_' + e.category)) : ''),
    el('td', { class: 'u' }, e.url.length > 300 ? e.url.slice(0, 300) + '…' : e.url),
    el('td', {}, e.status === 'blocked' && host ? el('button', { class: 'mini', title: '@@||' + host + '^', onclick: async () => {
      const cur = (await send({ type: 'userFilters:get' })).text;
      await send({ type: 'userFilters:set', text: (cur ? cur + '\n' : '') + `@@||${host}^` });
    } }, '✓') : ''));
  const body = $('logBody');
  if (prepend) body.prepend(tr); else body.append(tr);
  while (body.children.length > 1500) body.lastChild.remove();
}
$('logTab').onchange = () => { logTabId = $('logTab').value ? Number($('logTab').value) : null; port?.postMessage({ type: 'filter', tabId: logTabId }); reloadLog(); };
$('logFilter').oninput = reloadLog;
$('logOnlyBlocked').onchange = reloadLog;
$('logPause').onclick = () => { logPaused = !logPaused; $('logPause').classList.toggle('primary', logPaused); };
$('logClear').onclick = () => $('logBody').replaceChildren();

// ---------------------------------------------------------------------------
// Updates
// ---------------------------------------------------------------------------
function renderUpdate(st) {
  $('uCur').textContent = st.current;
  $('uLatest').textContent = st.available?.version || st.current;
  $('uLast').textContent = fmtDate(st.lastExtCheck) + (st.extError ? ` ⚠ ${st.extError}` : '');
  const notes = st.available?.notes?.[document.documentElement.lang] || st.available?.notes?.en;
  $('uNotes').hidden = !notes; $('uNotes').textContent = notes || '';
  const ua = navigator.userAgent.includes('Firefox') ? 'firefox' : 'chromium';
  $('uDownload').hidden = !st.available;
  if (st.available) { $('uDownload').href = st.available.download?.[ua] || st.available.page || '#'; $('uDownload').target = '_blank'; }
  $('updDot').hidden = !st.available;
  const rs = st.remoteState;
  $('rVer').textContent = rs?.version || t('notApplied');
  $('rLast').textContent = fmtDate(st.lastFilterCheck) + (st.filterError ? ` ⚠ ${st.filterError}` : '');
  $('rRules').textContent = rs ? `${fmtNum(rs.stats?.rules)} DNR · ${fmtNum(rs.stats?.cosmetic)} ${t('cosmeticRules')}` : '—';
}
loaders.updates = async () => { bindSettings($('sec-updates')); renderUpdate(await send({ type: 'update:status' })); };
$('checkNow').onclick = async () => {
  $('checkNow').disabled = true; $('uMsg').textContent = t('checking');
  const r = await send({ type: 'update:checkNow' });
  $('checkNow').disabled = false;
  $('uMsg').textContent = r.ext?.ok && !r.ext.available ? t('upToDate') : (r.ext?.error || r.filters?.error || '');
  renderUpdate(r.status);
};

// ---------------------------------------------------------------------------
// Settings & backup
// ---------------------------------------------------------------------------
loaders.settings = () => { bindSettings($('sec-settings')); renderSync(); renderAI(); };
$('exportBtn').onclick = async () => {
  const data = await send({ type: 'backup:export' });
  const a = el('a', { href: URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })), download: `wipe-ad-backup-${new Date().toISOString().slice(0, 10)}.json` });
  a.click();
};
$('importBtn').onclick = () => $('importFile').click();
$('importFile').onchange = async () => {
  const f = $('importFile').files[0];
  if (!f) return;
  try {
    const r = await send({ type: 'backup:import', data: JSON.parse(await f.text()) });
    $('backupMsg').textContent = r.ok ? t('imported') : r.error;
    settings = await send({ type: 'settings:get' });
  } catch (e) { $('backupMsg').textContent = String(e); }
};

// ---------------------------------------------------------------------------
// Diagnostics
// ---------------------------------------------------------------------------
let diagRows = [];
loaders.diagnostics = async () => {
  diagRows = await send({ type: 'diag:list' });
  $('diagBody').replaceChildren(...(diagRows.length ? diagRows.map(e => {
    const { t: time, level, kind, v, ...rest } = e;
    return el('tr', { class: level === 'error' ? 's-blocked' : 's-redirected' },
      el('td', {}, new Date(time).toLocaleString()), el('td', {}, level), el('td', {}, kind),
      el('td', { class: 'u' }, JSON.stringify(rest).slice(0, 600)));
  }) : [el('tr', {}, el('td', { colspan: 4, class: 'muted small' }, t('noData')))]));
};
$('diagExport').onclick = () => {
  const a = el('a', { href: URL.createObjectURL(new Blob([JSON.stringify({ version: chrome.runtime.getManifest().version, ua: navigator.userAgent, events: diagRows }, null, 2)], { type: 'application/json' })), download: `wipe-ad-diagnostics-${Date.now()}.json` });
  a.click();
};
$('diagClear').onclick = async () => { await send({ type: 'diag:clear' }); loaders.diagnostics(); };

// ---------------------------------------------------------------------------
// About
// ---------------------------------------------------------------------------
loaders.about = async () => {
  const { lists } = await send({ type: 'rulesets:list' });
  $('credits').replaceChildren(...lists.map(l => el('li', {}, el('a', { href: l.home, target: '_blank' }, l.name))));
};

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------
await initI18n();
settings = await send({ type: 'settings:get' });
$('ver').textContent = chrome.runtime.getManifest().version;
const policy = await send({ type: 'settings:policy' });
$('managed').hidden = !policy?.active;
for (const k of policy?.lockedKeys || []) document.querySelectorAll(`[data-setting="${k}"]`).forEach(i => { i.disabled = true; i.title = t('managedBanner'); });
if (policy?.disableUserFilters) { $('userFilters').disabled = true; $('saveFilters').disabled = true; }
bindSettings();
send({ type: 'update:status' }).then(st => { $('updDot').hidden = !st.available; });

const hash = decodeURIComponent(location.hash.slice(1));
if (hash.startsWith('log=')) { logTabId = Number(hash.slice(4)); show('log'); }
else if (hash.startsWith('subscribe=')) {
  const p = new URLSearchParams(location.hash.slice(1));
  const url = p.get('subscribe'), title = p.get('title') || '';
  show('lists');
  $('subTitle').textContent = title; $('subUrl').textContent = url;
  $('subDialog').showModal();
  $('subDialog').addEventListener('close', async () => {
    if ($('subDialog').returnValue === 'ok') { await send({ type: 'subscribe:add', url, title }); settings = await send({ type: 'settings:get' }); setTimeout(loaders.lists, 1500); }
  }, { once: true });
} else if (hash === 'welcome') { $('welcome').hidden = false; show('overview'); }
else show(loaders[hash] ? hash : 'overview');
