import { initI18n, t, send, fmtNum, el } from './i18n.js';

const $ = id => document.getElementById(id);
let tab, data;

async function load() {
  [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  data = await send({ type: 'popup:get', tabId: tab.id });
  render();
}

function render() {
  const web = /^https?:/.test(data.url);
  $('ver').textContent = data.version;
  $('host').textContent = data.host || '—';
  $('cntPage').textContent = fmtNum(data.summary.blocked);
  $('cntTotal').textContent = fmtNum(data.totals.blocked);
  $('cntBanners').textContent = fmtNum(data.totals.cookieBanners);
  $('globalOff').hidden = data.settings.enabled;
  $('notWeb').hidden = web;
  $('siteControls').hidden = !web || !data.settings.enabled;

  const on = data.mode !== 'off';
  $('power').classList.toggle('off', !on);
  $('power').setAttribute('aria-pressed', String(on));
  $('power').disabled = !web || !data.settings.enabled;
  $('stateText').textContent = data.pausedUntil ? `${t('pausedHere')} ${new Date(data.pausedUntil).toLocaleTimeString()}` : on ? t('enabledHere') : t('disabledHere');

  const mode = on ? data.mode : null;
  document.querySelectorAll('#modes button').forEach(b => {
    b.classList.toggle('active', b.dataset.mode === mode);
    b.disabled = !on;
  });
  $('modeHint').textContent = mode ? t('mode' + mode[0].toUpperCase() + mode.slice(1) + 'Hint') : '';
  $('pauseLabel').textContent = data.pausedUntil ? t('resume') : t('pause');
  $('pick').disabled = $('zap').disabled = !on;

  const avail = data.update?.available;
  $('update').hidden = !avail;
  if (avail) {
    $('updVer').textContent = avail.version;
    const ua = navigator.userAgent.includes('Firefox') ? 'firefox' : 'chromium';
    $('updLink').onclick = e => { e.preventDefault(); chrome.tabs.create({ url: avail.download?.[ua] || avail.page || 'https://github.com' }); };
  }

  const fp = data.summary.fingerprinting || [];
  $('fpBox').hidden = !fp.length;
  $('fpList').replaceChildren(...fp.slice(0, 8).map(f => el('div', { class: 'row' },
    el('span', { class: 'chip cat-t' }, data.settings.antiFingerprint ? t('fpProtected') : t('fpDetectedOnly')),
    el('span', { class: 'd' }, f.script),
    el('span', { class: 'muted' }, f.apis.map(a => t('api_' + a)).join(' · ')))));

  const box = $('trackers');
  box.replaceChildren();
  const list = data.summary.domains.slice(0, 60);
  if (!list.length) box.append(el('div', { class: 'muted small' }, t('noTrackers')));
  for (const d of list) {
    const cat = d.category || 'o';
    box.append(el('div', { class: 'tr' },
      el('span', { class: `chip cat-${cat}` }, t('cat_' + cat)),
      el('span', { class: 'd', title: d.hosts.join('\n') }, d.base),
      el('span', { class: 'n' + (d.blocked ? ' b' : '') }, d.blocked ? `${fmtNum(d.blocked)} ${t('blocked')}` : `${fmtNum(d.count)} ${t('allowed')}`)));
  }
}

$('power').onclick = async () => {
  const off = data.mode !== 'off';
  if (data.pausedUntil) await send({ type: 'site:pause', host: data.host, minutes: 0, tabId: tab.id });
  await send({ type: 'site:setMode', host: data.host, mode: off ? 'off' : 'standard', tabId: tab.id });
  chrome.tabs.reload(tab.id);
  await load();
};
document.querySelectorAll('#modes button').forEach(b => b.onclick = async () => {
  await send({ type: 'site:setMode', host: data.host, mode: b.dataset.mode, tabId: tab.id });
  chrome.tabs.reload(tab.id);
  await load();
});
$('pause').onclick = async () => {
  await send({ type: 'site:pause', host: data.host, minutes: data.pausedUntil ? 0 : 30, tabId: tab.id });
  await load();
};
$('brBasic').onclick = async () => { await send({ type: 'site:setMode', host: data.host, mode: 'basic', tabId: tab.id }); chrome.tabs.reload(tab.id); await load(); };
$('brOff').onclick = async () => { await send({ type: 'site:setMode', host: data.host, mode: 'off', tabId: tab.id }); chrome.tabs.reload(tab.id); await load(); };
$('brReport').onclick = async () => { await send({ type: 'site:report', tabId: tab.id }); window.close(); };
$('pick').onclick = async () => { await send({ type: 'picker:start', tabId: tab.id, mode: 'pick' }); window.close(); };
$('zap').onclick = async () => { await send({ type: 'picker:start', tabId: tab.id, mode: 'zap' }); window.close(); };
$('openDash').onclick = () => { chrome.runtime.openOptionsPage(); window.close(); };
$('openLog').onclick = () => { chrome.tabs.create({ url: chrome.runtime.getURL(`ui/dashboard.html#log=${tab.id}`) }); window.close(); };
$('turnOn').onclick = async () => { await send({ type: 'settings:set', patch: { enabled: true } }); await load(); };

await initI18n();
await load();
