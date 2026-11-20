// Wipe Ad — settings sync across devices through the browser account (chrome.storage.sync).
// Synced: settings (except device-only keys), my filters, and per-tracker choices.
// Limits: 100 KB total, 8 KB per item → filters are split into chunks.

import { LOCAL_ONLY } from './settings.js';

const CHUNK = 7000;
const MAX_CHUNKS = 12;
let applying = false;
let pushTimer = null;
const deviceId = Math.random().toString(36).slice(2);

function chunks(text) {
  const out = [];
  for (let i = 0; i < text.length && out.length < MAX_CHUNKS; i += CHUNK) out.push(text.slice(i, i + CHUNK));
  return out;
}

/** Push local state to sync storage (debounced). */
export function schedulePush(collect) {
  if (applying) return;
  clearTimeout(pushTimer);
  pushTimer = setTimeout(async () => {
    try {
      const { settings, userFilters, learningUser } = await collect();
      if (!settings?.syncEnabled) return;
      const shared = Object.fromEntries(Object.entries(settings).filter(([k]) => !LOCAL_ONLY.includes(k) && k !== 'forcedRulesets'));
      const parts = chunks(userFilters || '');
      const data = { ws_meta: { ts: Date.now(), device: deviceId, chunks: parts.length }, ws_settings: shared, ws_learning: learningUser || {} };
      parts.forEach((p, i) => { data['ws_uf_' + i] = p; });
      const old = await chrome.storage.sync.get(null);
      const stale = Object.keys(old).filter(k => k.startsWith('ws_uf_') && Number(k.slice(6)) >= parts.length);
      if (stale.length) await chrome.storage.sync.remove(stale);
      await chrome.storage.sync.set(data);
      // what we just pushed is already applied here
      await chrome.storage.local.set({ syncState: { lastPush: Date.now(), lastPull: data.ws_meta.ts, error: null } });
    } catch (e) {
      await chrome.storage.local.set({ syncState: { lastPush: Date.now(), error: String(e.message || e) } });
    }
  }, 4000);
}

/** Pull remote state if it is newer than what we applied last. */
export async function pull(apply, { force = false } = {}) {
  const all = await chrome.storage.sync.get(null);
  const meta = all.ws_meta;
  if (!meta) return { changed: false };
  const { syncState = {} } = await chrome.storage.local.get('syncState');
  if (!force && (meta.device === deviceId || meta.ts <= (syncState.lastPull || 0))) return { changed: false };
  let filters = '';
  for (let i = 0; i < (meta.chunks || 0); i++) filters += all['ws_uf_' + i] || '';
  applying = true;
  try {
    await apply({ settings: all.ws_settings || {}, userFilters: filters, learningUser: all.ws_learning || {} });
  } finally { applying = false; }
  await chrome.storage.local.set({ syncState: { ...syncState, lastPull: meta.ts, error: null } });
  return { changed: true };
}

export function onRemoteChange(handler) {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'sync' && changes.ws_meta && changes.ws_meta.newValue?.device !== deviceId) handler();
  });
}

export async function syncStatus() {
  const { syncState = {} } = await chrome.storage.local.get('syncState');
  let bytes = null;
  try { bytes = await chrome.storage.sync.getBytesInUse(null); } catch { /* Firefox */ }
  return { ...syncState, bytes };
}
