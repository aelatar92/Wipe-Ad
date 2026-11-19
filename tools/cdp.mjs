// Tiny Chrome DevTools Protocol helper (uses Node's built-in WebSocket) + Chromium launcher.
import { spawn } from 'node:child_process';
import { existsSync, readdirSync, mkdtempSync, rmSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';

export const sleep = ms => new Promise(r => setTimeout(r, ms));

export class CDP {
  constructor(ws) {
    this.ws = ws; this.id = 0; this.pending = new Map(); this.events = [];
    ws.onmessage = ev => {
      const m = JSON.parse(ev.data);
      if (m.id && this.pending.has(m.id)) {
        const { res, rej } = this.pending.get(m.id); this.pending.delete(m.id);
        m.error ? rej(new Error(m.error.message)) : res(m.result);
      } else this.events.push(m);
    };
  }
  static async connect(url) { const ws = new WebSocket(url); await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; }); return new CDP(ws); }
  send(method, params = {}, sessionId) {
    const id = ++this.id;
    this.ws.send(JSON.stringify({ id, method, params, sessionId }));
    return new Promise((res, rej) => this.pending.set(id, { res, rej }));
  }
  async eval(sessionId, expression) {
    const r = await this.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }, sessionId);
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
    return r.result.value;
  }
}

/** Locate a Chromium that honours --load-extension (branded Chrome 137+ does not). */
export function findChromium(explicit) {
  if (explicit && existsSync(explicit)) return explicit;
  if (process.env.WIPEAD_CHROMIUM && existsSync(process.env.WIPEAD_CHROMIUM)) return process.env.WIPEAD_CHROMIUM;
  const roots = [join(homedir(), 'AppData', 'Local', 'ms-playwright'), join(homedir(), '.cache', 'ms-playwright'), join(homedir(), 'Library', 'Caches', 'ms-playwright')];
  for (const pw of roots) {
    if (!existsSync(pw)) continue;
    for (const d of readdirSync(pw).filter(d => /^chromium-\d+$/.test(d)).sort().reverse()) {
      for (const rel of [['chrome-win64', 'chrome.exe'], ['chrome-win', 'chrome.exe'], ['chrome-linux', 'chrome'], ['chrome-linux64', 'chrome'], ['chrome-mac', 'Chromium.app', 'Contents', 'MacOS', 'Chromium']]) {
        const p = join(pw, d, ...rel);
        if (existsSync(p)) return p;
      }
    }
  }
  return null;
}

/** Launch Chromium with an unpacked extension; returns { cdp, proc, close, port }. */
export async function launchWithExtension(chrome, extDir, port = 9333) {
  const profile = mkdtempSync(join(tmpdir(), 'wipead-chromium-'));
  const proc = spawn(chrome, [`--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, `--load-extension=${extDir}`,
    `--disable-extensions-except=${extDir}`, '--headless=new', '--no-first-run', '--no-default-browser-check', '--window-size=1280,900',
    ...(process.env.CI || process.platform === 'linux' ? ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'] : []), 'about:blank'], { stdio: 'ignore' });
  let ver;
  for (let i = 0; i < 75 && !ver; i++) { try { ver = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json(); } catch { await sleep(200); } }
  if (!ver) { proc.kill(); throw new Error('Chromium did not start'); }
  const cdp = await CDP.connect(ver.webSocketDebuggerUrl);
  const close = async () => {
    try { await cdp.send('Browser.close'); } catch { /* ignore */ }
    proc.kill(); await sleep(600);
    try { rmSync(profile, { recursive: true, force: true }); } catch { /* ignore */ }
  };
  return { cdp, proc, close, version: ver.Browser };
}

export async function findServiceWorker(cdp, suffix, timeoutMs = 15000) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    const { targetInfos } = await cdp.send('Target.getTargets');
    const sw = targetInfos.find(t => t.type === 'service_worker' && t.url.endsWith(suffix));
    if (sw) return sw;
    await sleep(250);
  }
  return null;
}
