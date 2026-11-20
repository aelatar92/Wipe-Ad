// Wipe Ad end-to-end test: loads dist/chromium into a Chromium build via CDP (no dependencies).
//   node tests/e2e/run.mjs [path-to-chrome.exe]
import { createServer } from 'node:http';
import { writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { findChromium, launchWithExtension, sleep } from '../../tools/cdp.mjs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const EXT = join(ROOT, 'dist', 'chromium');
const OUT = join(ROOT, 'tests', 'e2e', 'out');
const PORT = 9333, WEB = 8765;


const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok, detail }); console.log(`${ok ? '✔' : '✖'} ${name}${detail ? ' — ' + detail : ''}`); };

// ---------------------------------------------------------------- test site
const PAGE = `<!doctype html><html><head><meta charset="utf-8"><title>Wipe Ad test page</title></head><body>
<h1>Wipe Ad test</h1>
<div id="AdBar" class="t">generic #id ad</div>
<div class="sponsored-post t">generic .class ad</div>
<div id="late-holder"></div>
<a class="t" id="complex" href="https://1winpb.com/promo">complex generic ad link</a>
<div class="content" id="keep">real content</div>
<img id="adimg" src="https://pagead2.googlesyndication.com/pagead/images/x.gif">
<script>window.__adsLoaded=false;</script>
<script src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js" onload="window.__adsLoaded=true"></script>
<div id="onetrust-banner-sdk" style="position:fixed;bottom:0;left:0;right:0;background:#eee;padding:20px">Cookies!
  <button id="onetrust-accept-btn-handler" onclick="window.__consent='accepted'">Accept</button>
  <button id="onetrust-reject-all-handler" onclick="window.__consent='rejected'">Reject all</button></div>
<script>setTimeout(()=>{const d=document.createElement('div');d.id='ADbox';d.textContent='late ad';document.getElementById('late-holder').append(d);},300);</script>
</body></html>`;
// mock update server: a newer version + one live delta list
const DELTA = '||live-update-test.example^\n##.wipead-live-test\n';
const sha = createHash('sha256').update(DELTA).digest('hex');
const UPDATES = {
  '/updates/version.json': { version: '9.9.9', notes: { en: 'Test update', ar: 'تحديث تجريبي' }, download: { chromium: 'https://example.com/x.zip' } },
  '/updates/filters/manifest.json': { version: 'test-1', generated: new Date().toISOString(), lists: [{ id: 'live', ruleset: null, url: 'live.txt', sha256: sha }] },
};
const V11_PAGE = `<!doctype html><body><canvas id="c" width="200" height="50"></canvas><script>
  const c = document.getElementById('c'), x = c.getContext('2d');
  x.font = '18px Arial'; x.fillStyle = '#f60'; x.fillText('fingerprint ✓', 4, 30);
  window.__fp1 = c.toDataURL(); window.__fp2 = c.toDataURL();
  window.__notif = window.Notification ? Notification.permission : 'n/a';
  setTimeout(() => fetch('/api/data').then(r => r.json()).then(j => { window.__api = j; }), 400);
</script></body>`;
const LIVE_PAGE ='<!doctype html><body><div class="wipead-live-test" id="lt">live rule target</div><div id="ok">ok</div></body>';
const server = createServer((req, res) => {
  const path = req.url.split('?')[0];
  if (UPDATES[path]) { res.writeHead(200, { 'content-type': 'application/json' }); return res.end(JSON.stringify(UPDATES[path])); }
  if (path === '/updates/filters/live.txt') { res.writeHead(200, { 'content-type': 'text/plain' }); return res.end(DELTA); }
  if (path === '/live') { res.writeHead(200, { 'content-type': 'text/html' }); return res.end(LIVE_PAGE); }
  if (path === '/api/data') { res.writeHead(200, { 'content-type': 'application/json' }); return res.end(JSON.stringify({ ads: [1, 2], content: 'ok' })); }
  if (path === '/v11') { res.writeHead(200, { 'content-type': 'text/html' }); return res.end(V11_PAGE); }
  res.writeHead(200, { 'content-type': 'text/html' }); res.end(PAGE);
}).listen(WEB);

async function main() {
  const chrome = findChromium(process.argv[2]);
  if (!chrome) throw new Error('Chromium not found — pass the path to chrome.exe (branded Chrome ignores --load-extension)');
  const b = await launchWithExtension(chrome, EXT, PORT);
  const cdp = b.cdp;
  try {
    check('browser started', true, b.version);

    // extension service worker
    let sw;
    for (let i = 0; i < 60 && !sw; i++) {
      const { targetInfos } = await cdp.send('Target.getTargets');
      sw = targetInfos.find(t => t.type === 'service_worker' && t.url.endsWith('/background/index.js'));
      if (!sw) await sleep(250);
    }
    check('service worker running', !!sw, sw?.url);
    if (!sw) throw new Error('no service worker');
    const extId = new URL(sw.url).host;
    const { sessionId: swS } = await cdp.send('Target.attachToTarget', { targetId: sw.targetId, flatten: true });
    await cdp.send('Runtime.enable', {}, swS);
    await sleep(3000); // let onInstalled finish

    const rs = await cdp.eval(swS, 'chrome.declarativeNetRequest.getEnabledRulesets()');
    check('static rulesets enabled', rs.length >= 8, rs.join(','));
    const dyn = await cdp.eval(swS, 'chrome.declarativeNetRequest.getDynamicRules().then(r => r.length)');
    check('dynamic rules installed (stealth etc.)', dyn > 0, `${dyn} rules`);

    const tm = (url, type, initiator) => cdp.eval(swS, `chrome.declarativeNetRequest.testMatchOutcome({url:${JSON.stringify(url)},type:${JSON.stringify(type)},initiator:${JSON.stringify(initiator)},tabId:-1}).then(r=>r.matchedRules.map(m=>m.rulesetId+':'+m.ruleId))`);
    const m1 = await tm('https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js', 'script', 'https://news.example');
    check('ad script matched', m1.length > 0, m1.join(' '));
    const m2 = await tm('https://www.google-analytics.com/analytics.js', 'script', 'https://shop.example');
    check('analytics matched (block or surrogate)', m2.length > 0, m2.join(' '));
    const m3 = await tm('https://example.com/page?utm_source=x&id=5', 'main_frame', 'https://www.google.com');
    check('tracking params rule matched', m3.length > 0, m3.join(' '));
    const m4 = await tm('https://cdn.jsdelivr.net/npm/jquery@3/dist/jquery.min.js', 'script', 'https://blog.example');
    check('harmless CDN script not blocked', m4.every(x => /^_dynamic:\d+$/.test(x)), m4.join(' ') || 'no match');

    // test page
    const { targetId } = await cdp.send('Target.createTarget', { url: `http://localhost:${WEB}/article?utm_source=newsletter&fbclid=abc&id=7` });
    const { sessionId: pS } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
    await cdp.send('Page.enable', {}, pS);
    await sleep(4000);
    const page = await cdp.eval(pS, `(() => {
      const vis = id => { const e = document.getElementById(id); return e ? getComputedStyle(e).display !== 'none' : null; };
      return { url: location.href, AdBar: vis('AdBar'), sponsored: getComputedStyle(document.querySelector('.sponsored-post')).display !== 'none',
        complex: vis('complex'), late: vis('ADbox'), keep: vis('keep'), adsLoaded: window.__adsLoaded, surrogate: window.adsbygoogle?.loaded === true && typeof window.adsbygoogle.push === 'function' && !document.querySelector('script[src*="googlesyndication"]')?.__real, consent: window.__consent || null,
        gpc: navigator.globalPrivacyControl === true };
    })()`);
    check('tracking params stripped from URL', !/utm_source|fbclid/.test(page.url), page.url);
    check('generic #id ad hidden', page.AdBar === false);
    check('generic .class ad hidden', page.sponsored === false);
    check('complex generic selector hidden', page.complex === false);
    check('ad added later hidden (MutationObserver)', page.late === false);
    check('real content still visible', page.keep === true);
    check('ad script blocked or replaced by surrogate', page.adsLoaded === false || page.surrogate === true, `loaded=${page.adsLoaded} surrogate=${page.surrogate}`);
    check('cookie banner auto-rejected', page.consent === 'rejected', String(page.consent));
    check('GPC signal exposed to page', page.gpc === true);
    const shot = await cdp.send('Page.captureScreenshot', { format: 'png' }, pS);
    writeFileSync(join(OUT, 'test-page.png'), Buffer.from(shot.data, 'base64'));

    const stats = await cdp.eval(swS, `chrome.storage.local.get('totals').then(r => r.totals)`);
    check('blocked requests counted', (stats?.blocked || 0) > 0, JSON.stringify(stats));

    // UI pages render without errors
    for (const [name, path, w, h] of [['popup', 'ui/popup.html', 360, 600], ['dashboard', 'ui/dashboard.html#lists', 1280, 900], ['dashboard-privacy', 'ui/dashboard.html#privacy', 1280, 900], ['blocked', 'ui/blocked.html?url=https%3A%2F%2Fevil.example%2F', 1000, 700]]) {
      const { targetId: t2 } = await cdp.send('Target.createTarget', { url: `chrome-extension://${extId}/${path}` });
      const { sessionId: s2 } = await cdp.send('Target.attachToTarget', { targetId: t2, flatten: true });
      await cdp.send('Runtime.enable', {}, s2);
      await cdp.send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: false }, s2);
      await sleep(1500);
      const errs = cdp.events.filter(e => e.sessionId === s2 && e.method === 'Runtime.exceptionThrown').map(e => e.params.exceptionDetails.exception?.description || e.params.exceptionDetails.text);
      const text = await cdp.eval(s2, 'document.body.innerText.length');
      check(`${name} page renders`, errs.length === 0 && text > 20, errs.join(' | ') || `${text} chars`);
      const s = await cdp.send('Page.captureScreenshot', { format: 'png' }, s2);
      writeFileSync(join(OUT, `${name}.png`), Buffer.from(s.data, 'base64'));
    }
    // ---- auto-update: point the extension at the mock server and trigger a check
    {
      const { targetId: t3 } = await cdp.send('Target.createTarget', { url: `chrome-extension://${extId}/ui/dashboard.html#updates` });
      const { sessionId: s3 } = await cdp.send('Target.attachToTarget', { targetId: t3, flatten: true });
      await sleep(1200);
      await cdp.eval(s3, `chrome.runtime.sendMessage({ type: 'settings:set', patch: { updateBase: 'http://localhost:${WEB}/updates' } })`);
      const r = await cdp.eval(s3, `chrome.runtime.sendMessage({ type: 'update:checkNow' })`);
      check('update check: new version detected', r.ext?.available?.version === '9.9.9', JSON.stringify(r.ext));
      check('update check: live rules applied', r.filters?.ok && r.filters.changed, JSON.stringify(r.filters).slice(0, 200));
      const mm = await tm('https://live-update-test.example/ad.js', 'script', 'https://news.example');
      check('live network rule active', mm.some(x => /^_dynamic:2\d{4}$/.test(x)), mm.join(' '));
      const { targetId: t4 } = await cdp.send('Target.createTarget', { url: `http://localhost:${WEB}/live` });
      const { sessionId: s4 } = await cdp.send('Target.attachToTarget', { targetId: t4, flatten: true });
      await sleep(2500);
      const lv = await cdp.eval(s4, `({ lt: getComputedStyle(document.getElementById('lt')).display, ok: getComputedStyle(document.getElementById('ok')).display })`);
      check('live cosmetic rule active', lv.lt === 'none' && lv.ok !== 'none', JSON.stringify(lv));
      await cdp.send('Runtime.enable', {}, s3);
      await cdp.send('Page.reload', {}, s3);
      await sleep(1500);
      const s = await cdp.send('Page.captureScreenshot', { format: 'png' }, s3);
      writeFileSync(join(OUT, 'dashboard-updates.png'), Buffer.from(s.data, 'base64'));
      // Arabic UI
      await cdp.eval(s3, `chrome.runtime.sendMessage({ type: 'settings:set', patch: { language: 'ar' } })`);
      const { targetId: t5 } = await cdp.send('Target.createTarget', { url: `chrome-extension://${extId}/ui/dashboard.html#overview` });
      const { sessionId: s5 } = await cdp.send('Target.attachToTarget', { targetId: t5, flatten: true });
      await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false }, s5);
      await sleep(1500);
      const dir = await cdp.eval(s5, 'document.documentElement.dir');
      check('Arabic UI is right-to-left', dir === 'rtl', dir);
      const s6 = await cdp.send('Page.captureScreenshot', { format: 'png' }, s5);
      writeFileSync(join(OUT, 'dashboard-ar.png'), Buffer.from(s6.data, 'base64'));
    }

    // ---- v1.1 features
    {
      const { targetId: tc } = await cdp.send('Target.createTarget', { url: `chrome-extension://${extId}/ui/dashboard.html#overview` });
      const { sessionId: ctl } = await cdp.send('Target.attachToTarget', { targetId: tc, flatten: true });
      await sleep(1200);
      const msg = m => cdp.eval(ctl, `chrome.runtime.sendMessage(${JSON.stringify(m)})`);
      const open = async (url, wait = 2500) => {
        const { targetId } = await cdp.send('Target.createTarget', { url });
        const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
        await sleep(wait);
        return sessionId;
      };
      await msg({ type: 'settings:set', patch: { language: 'en', antiFingerprint: true, blockNotificationPrompts: true } });
      await msg({ type: 'userFilters:set', text: `localhost##+js(json-prune-fetch-response, ads, , propsToMatch, /api/)` });
      await sleep(800);

      const regs = await cdp.eval(swS, 'chrome.scripting.getRegisteredContentScripts().then(r => r.map(x => x.id))');
      check('YouTube scriptlets registered at document_start', regs.includes('wipead-sl-wipead-youtube-0') && regs.some(r => r.startsWith('wipead-sl-ublock-')), `${regs.length} scripts`);

      // tracking redirect skipping (never reaches facebook: the browser redirects before the request)
      const sk = await open(`https://l.facebook.com/l.php?u=${encodeURIComponent(`http://localhost:${WEB}/live`)}&h=AT0x`);
      const skUrl = await cdp.eval(sk, 'location.href');
      check('tracking redirect skipped', skUrl === `http://localhost:${WEB}/live`, skUrl);

      // fingerprint noise + detection, notification prompts, fetch JSON pruning
      const v = await open(`http://localhost:${WEB}/v11`, 3000);
      const pv = await cdp.eval(v, '({ noisy: window.__fp1 !== window.__fp2, notif: window.__notif, api: window.__api })');
      check('canvas fingerprint is blurred', pv.noisy === true);
      check('notification prompts refused', pv.notif === 'denied', pv.notif);
      check('json-prune-fetch-response removes ad data', pv.api && !('ads' in pv.api) && pv.api.content === 'ok', JSON.stringify(pv.api));
      const tabId = await cdp.eval(ctl, `chrome.tabs.query({ url: 'http://localhost:${WEB}/v11' }).then(t => t[0].id)`);
      const pop = await msg({ type: 'popup:get', tabId });
      check('fingerprinting attempt reported', (pop.summary.fingerprinting || []).some(f => f.apis.includes('canvas')), JSON.stringify(pop.summary.fingerprinting));

      // focus mode
      await msg({ type: 'settings:set', patch: { focus: { enabled: true, sites: ['focus-test.localhost'], days: [0, 1, 2, 3, 4, 5, 6], allDay: true, from: '00:00', to: '23:59' } } });
      await sleep(500);
      const fo = await open('http://focus-test.localhost:' + WEB + '/x', 2000);
      const foUrl = await cdp.eval(fo, 'location.href');
      check('focus mode blocks distracting site', foUrl.endsWith('/ui/focus.html'), foUrl);
      await msg({ type: 'settings:set', patch: { focus: { enabled: false, sites: [], days: [], allDay: false } } });

      // safe mode
      await msg({ type: 'settings:set', patch: { safeMode: true } });
      await sleep(1500);
      const sm = await tm('https://www.google.com/search?q=test', 'main_frame', 'https://www.google.com');
      check('safe mode: SafeSearch rule active', sm.some(x => /^_dynamic:6\d\d$/.test(x)), sm.join(' '));
      const rsOn = await cdp.eval(swS, 'chrome.declarativeNetRequest.getEnabledRulesets()');
      check('safe mode: adult list enabled', rsOn.includes('adult'), rsOn.join(','));
      await msg({ type: 'settings:set', patch: { safeMode: false } });

      // search badges, report, AI, sync
      const malware = await cdp.eval(swS, `fetch(chrome.runtime.getURL('data/categories.json')).then(r => r.json()).then(c => c.m[0])`);
      const serp = await msg({ type: 'serp:check', hosts: [malware, 'example.org'] });
      check('search badge data for malicious site', serp[malware]?.category === 'm', `${malware} → ${JSON.stringify(serp[malware])}`);
      const rep = await msg({ type: 'report:weekly' });
      check('weekly report has 7 days of data', rep.days.length === 7 && rep.blocked > 0, `blocked=${rep.blocked}`);
      const ai = await msg({ type: 'ai:status' });
      check('AI assistant bundled (official SDK)', ai.available === true, JSON.stringify(ai));
      const aiNoKey = await msg({ type: 'ai:selector', description: 'the banner', outline: 'body', host: 'localhost' });
      check('AI assistant asks for a key first', aiNoKey.error === 'NO_KEY', JSON.stringify(aiNoKey));
      await msg({ type: 'settings:set', patch: { syncEnabled: true } });
      await sleep(5000);
      const ss = await msg({ type: 'sync:status' });
      check('settings synced to browser account storage', !!ss.lastPush && !ss.error, JSON.stringify(ss));

      for (const [name, hash] of [['report', 'report'], ['focus', 'focus'], ['privacy-v11', 'privacy']]) {
        await cdp.eval(ctl, `location.hash = '${hash}'; location.reload()`).catch(() => {});
        await sleep(1500);
        const errs = cdp.events.filter(e => e.sessionId === ctl && e.method === 'Runtime.exceptionThrown');
        const s = await cdp.send('Page.captureScreenshot', { format: 'png' }, ctl);
        writeFileSync(join(OUT, `dashboard-${name}.png`), Buffer.from(s.data, 'base64'));
        check(`dashboard ${name} section renders`, errs.length === 0, errs.map(e => e.params.exceptionDetails.exception?.description).join(' | '));
      }
    }

    const swErrs = cdp.events.filter(e => e.sessionId === swS && e.method === 'Runtime.exceptionThrown');
    check('no uncaught service worker errors', swErrs.length === 0, swErrs.map(e => e.params.exceptionDetails.exception?.description).join(' | '));
  } catch (e) {
    check('e2e run', false, e.stack || String(e));
  } finally {
    await b.close(); server.close();
  }
  const failed = results.filter(r => !r.ok).length;
  console.log(`\n${results.length - failed}/${results.length} checks passed`);
  process.exit(failed ? 1 : 0);
}

mkdirSync(OUT, { recursive: true });
main().catch(e => { console.error(e); process.exit(1); });
