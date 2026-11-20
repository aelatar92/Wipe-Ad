import { initI18n, t, send } from './i18n.js';

await initI18n();
const tick = () => { document.getElementById('clock').textContent = new Date().toLocaleTimeString(document.documentElement.lang === 'ar' ? 'ar-EG' : 'en-US', { hour: '2-digit', minute: '2-digit' }); };
tick(); setInterval(tick, 10000);
const s = await send({ type: 'settings:get' });
if (s?.focus && !s.focus.allDay) document.getElementById('until').textContent = `${t('focusUntil')} ${s.focus.to}`;
document.getElementById('settings').onclick = () => chrome.tabs.create({ url: chrome.runtime.getURL('ui/dashboard.html#focus') });
