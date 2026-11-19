// Wipe Ad — automatic updates
//  1) Extension updates: browser-native (store / update_url) + our own version.json check + notification
//  2) Rule updates: filters/manifest.json → delta lists compiled locally (no new release needed)

import { CONFIG } from '../shared/config.js';
import { getSettings } from './settings.js';
import { applyRemoteManifest } from './filters.js';

export const ALARM = 'wipead:update';

export function compareVersions(a, b) {
  const pa = String(a).split('.').map(n => parseInt(n, 10) || 0);
  const pb = String(b).split('.').map(n => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d) return d > 0 ? 1 : -1;
  }
  return 0;
}

export async function updateBase() {
  const s = await getSettings();
  return (s.updateBase || CONFIG.UPDATE_BASE).replace(/\/+$/, '');
}

async function getJSON(path) {
  const url = `${await updateBase()}/${path}?t=${Date.now()}`;
  const r = await fetch(url, { cache: 'no-store' });
  if (!r.ok) throw new Error(`HTTP ${r.status} ${path}`);
  return r.json();
}

async function setStatus(patch) {
  const { updateStatus = {} } = await chrome.storage.local.get('updateStatus');
  const next = { ...updateStatus, ...patch };
  await chrome.storage.local.set({ updateStatus: next });
  return next;
}

export async function getUpdateStatus() {
  const { updateStatus = {}, remoteState = null } = await chrome.storage.local.get(['updateStatus', 'remoteState']);
  return { ...updateStatus, remoteState, current: chrome.runtime.getManifest().version, base: await updateBase() };
}

export async function scheduleUpdates() {
  const s = await getSettings();
  const period = Math.max(30, s.updateIntervalMin || CONFIG.UPDATE_INTERVAL_MIN);
  const existing = await chrome.alarms.get(ALARM);
  if (!existing || existing.periodInMinutes !== period) {
    await chrome.alarms.create(ALARM, { delayInMinutes: 1, periodInMinutes: period });
  }
}

/** Check for a new extension version. */
export async function checkExtensionUpdate({ manual = false } = {}) {
  const current = chrome.runtime.getManifest().version;
  // Ask the browser to check its own update channel (Chrome Web Store / Edge Add-ons / update_url)
  try {
    if (chrome.runtime.requestUpdateCheck) {
      const r = await chrome.runtime.requestUpdateCheck();
      const st = r?.status || r;
      if (st === 'update_available') await setStatus({ browserUpdate: true });
    }
  } catch { /* throttled or unsupported */ }

  try {
    const info = await getJSON('version.json');
    const available = compareVersions(info.version, current) > 0 ? info : null;
    const prev = (await chrome.storage.local.get('updateStatus')).updateStatus || {};
    await setStatus({ lastExtCheck: Date.now(), available, extError: null });
    if (available && (prev.notifiedVersion !== info.version || manual)) {
      await setStatus({ notifiedVersion: info.version });
      notify(info, current);
    }
    return { ok: true, current, available };
  } catch (e) {
    await setStatus({ lastExtCheck: Date.now(), extError: String(e.message || e) });
    return { ok: false, error: String(e.message || e) };
  }
}

function notify(info, current) {
  const lang = (chrome.i18n.getUILanguage() || 'en').startsWith('ar') ? 'ar' : 'en';
  const notes = info.notes?.[lang] || info.notes?.en || '';
  try {
    chrome.notifications.create('wipead-update', {
      type: 'basic', iconUrl: chrome.runtime.getURL('icons/icon-128.png'),
      title: chrome.i18n.getMessage('updateAvailableTitle', [info.version]) || `Wipe Ad ${info.version}`,
      message: (chrome.i18n.getMessage('updateAvailableBody', [current]) || '') + (notes ? '\n' + notes.slice(0, 180) : ''),
      priority: 1,
    });
  } catch { /* notifications unavailable */ }
}

export function onNotificationClicked(id) {
  if (id !== 'wipead-update') return;
  chrome.storage.local.get('updateStatus').then(({ updateStatus }) => {
    const ua = navigator.userAgent.includes('Firefox') ? 'firefox' : 'chromium';
    const url = updateStatus?.available?.download?.[ua] || CONFIG.RELEASES_URL;
    chrome.tabs.create({ url });
  });
}

/** Check for new / changed filter rules. */
export async function checkFilterUpdates({ force = false, enabledIds = null } = {}) {
  try {
    const manifest = await getJSON('filters/manifest.json');
    const { remoteState } = await chrome.storage.local.get('remoteState');
    if (!force && remoteState?.version === manifest.version) {
      await setStatus({ lastFilterCheck: Date.now(), filterError: null });
      return { ok: true, changed: false, version: manifest.version };
    }
    const res = await applyRemoteManifest(manifest, (await updateBase()) + '/filters', enabledIds);
    await setStatus({ lastFilterCheck: Date.now(), filterError: null });
    return { ok: true, changed: true, version: manifest.version, ...res };
  } catch (e) {
    await setStatus({ lastFilterCheck: Date.now(), filterError: String(e.message || e) });
    return { ok: false, error: String(e.message || e) };
  }
}

export async function runScheduledUpdate(onFiltersChanged, enabledIds) {
  const s = await getSettings();
  const out = {};
  if (s.autoUpdateExtension) out.ext = await checkExtensionUpdate();
  if (s.autoUpdateFilters) {
    out.filters = await checkFilterUpdates({ enabledIds });
    if (out.filters.changed) await onFiltersChanged();
  }
  return out;
}

// When the browser has downloaded a new version, apply it right away (state is kept in storage).
export function handleUpdateAvailable() {
  getSettings().then(s => { if (s.autoUpdateExtension) chrome.runtime.reload(); });
}
