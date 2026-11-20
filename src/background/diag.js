// Wipe Ad — diagnostics. Records errors, slow operations and per-page health in a small ring
// buffer (shown in Dashboard → Diagnostics). On developer (unpacked) installs only, events are
// also streamed live to a monitor on this machine (tools/monitor.mjs, 127.0.0.1 only).

const MONITOR = 'http://127.0.0.1:47321/ingest';
const MAX = 400;
let buffer = null;
let saveTimer = null;
let devInstall = null;
let queue = [];
let flushTimer = null;
let monitorDown = 0;

async function isDev() {
  if (devInstall === null) {
    try { devInstall = (await chrome.management.getSelf()).installType === 'development'; } catch { devInstall = false; }
  }
  return devInstall;
}

async function load() {
  if (!buffer) { const { diag } = await chrome.storage.local.get('diag'); buffer = diag || []; }
  return buffer;
}

function flush() {
  flushTimer = null;
  if (!queue.length || Date.now() < monitorDown) { queue = []; return; }
  const batch = queue; queue = [];
  fetch(MONITOR, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(batch) })
    .catch(() => { monitorDown = Date.now() + 60000; }); // monitor not running: retry in a minute
}

/** level: error | warn | info | perf ; kind: short machine-readable tag */
export async function diag(level, kind, data = {}) {
  const ev = { t: Date.now(), level, kind, v: chrome.runtime.getManifest().version, ...data };
  if (level !== 'perf' && level !== 'info') {
    const b = await load();
    b.push(ev);
    if (b.length > MAX) b.splice(0, b.length - MAX);
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => chrome.storage.local.set({ diag: buffer }), 2000);
  }
  if (await isDev()) {
    queue.push(ev);
    if (!flushTimer) flushTimer = setTimeout(flush, 1000);
  }
}

export async function getDiag() { return [...(await load())].reverse(); }
export async function clearDiag() { buffer = []; await chrome.storage.local.set({ diag: [] }); }

/** Time an async operation; reports it when slower than `slowMs`. */
export async function timed(kind, fn, slowMs = 300, data = {}) {
  const t0 = performance.now();
  try { return await fn(); }
  finally {
    const ms = Math.round(performance.now() - t0);
    if (ms >= slowMs) diag('warn', 'slow:' + kind, { ms, ...data });
    else diag('perf', kind, { ms, ...data });
  }
}

/** Capture uncaught errors and our own console warnings in the service worker. */
export function installGlobalHandlers() {
  self.addEventListener('error', e => diag('error', 'sw:uncaught', { message: String(e.message), stack: String(e.error?.stack || '').slice(0, 1500) }));
  self.addEventListener('unhandledrejection', e => diag('error', 'sw:rejection', { message: String(e.reason?.message || e.reason), stack: String(e.reason?.stack || '').slice(0, 1500) }));
  const warn = console.warn.bind(console), error = console.error.bind(console);
  console.warn = (...a) => { warn(...a); if (String(a[0]).startsWith('[WipeAd]')) diag('warn', 'sw:warn', { message: a.map(x => x?.message || String(x)).join(' ').slice(0, 800) }); };
  console.error = (...a) => { error(...a); if (String(a[0]).startsWith('[WipeAd]')) diag('error', 'sw:error', { message: a.map(x => x?.message || String(x)).join(' ').slice(0, 800), stack: String(a.find(x => x?.stack)?.stack || '').slice(0, 1500) }); };
}
