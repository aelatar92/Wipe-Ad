// Wipe Ad — tracking-redirect skipper. The original redirect URL arrives in the hash;
// we extract the real destination and go there directly, so the tracker never sees the click.
const PARAMS = ['q', 'url', 'u', 'to', 'target', 'dest', 'destination', 'link', 'redirect', 'redirect_url'];

export function extractTarget(raw) {
  let u;
  try { u = new URL(raw); } catch { return null; }
  const isHttp = s => /^https?:\/\//i.test(s || '');
  for (const p of PARAMS) {
    let v = u.searchParams.get(p);
    if (!v) continue;
    if (p === 'u' && u.hostname.endsWith('bing.com') && v.startsWith('a1')) {
      try { v = atob(v.slice(2).replace(/-/g, '+').replace(/_/g, '/')); } catch { continue; }
    }
    if (isHttp(v)) return v;
  }
  // deviantart / href.li style: the whole query is the destination
  const q = decodeURIComponent(u.search.slice(1));
  if (isHttp(q)) return q;
  return null;
}

if (typeof document !== 'undefined') {
  const raw = location.hash.slice(1);
  const target = extractTarget(raw);
  if (target) {
    chrome.runtime.sendMessage({ type: 'stats:skipped' }).catch(() => {});
    location.replace(target);
  } else {
    const { initI18n } = await import('./i18n.js');
    await initI18n();
    document.getElementById('box').hidden = false;
    document.getElementById('orig').textContent = raw;
    document.getElementById('go').onclick = async () => {
      await chrome.runtime.sendMessage({ type: 'blocked:proceed', url: raw });
      location.replace(raw);
    };
  }
}
