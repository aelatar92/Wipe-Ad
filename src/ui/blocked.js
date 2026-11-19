import { initI18n, send } from './i18n.js';

await initI18n();
const params = new URLSearchParams(location.search);
const url = params.get('url') || '';
document.getElementById('url').textContent = url;
document.getElementById('back').onclick = () => { if (history.length > 2) history.go(-2); else location.href = 'about:blank'; };
document.getElementById('proceed').onclick = async () => {
  if (!/^https?:/.test(url)) return;
  await send({ type: 'blocked:proceed', url });
  location.replace(url);
};
document.getElementById('always').onclick = async () => {
  if (!/^https?:/.test(url)) return;
  await send({ type: 'blocked:allowSite', url });
  location.replace(url);
};
