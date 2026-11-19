// Wipe Ad — loads bundled data (rulesets catalog, cosmetic data, categories, PSL)
// and builds the in-memory cosmetic index used for every page.

import { setPublicSuffixList, hostKeys } from '../shared/domain.js';
import { emptyCosmetic, mergeCosmetic } from '../shared/filter-parser.js';

const url = p => chrome.runtime.getURL(p);
async function loadJSON(p, fallback = null) {
  try { const r = await fetch(url(p)); if (!r.ok) throw new Error(r.status); return await r.json(); }
  catch (e) { console.warn('[WipeAd] cannot load', p, e); return fallback; }
}

let catalog = null;
let categories = null;
let pslReady = null;
let index = null;
let indexKey = '';

export async function ensurePSL() {
  if (!pslReady) pslReady = loadJSON('data/psl.json', { r: [], w: [], e: [] }).then(setPublicSuffixList);
  return pslReady;
}

export async function getCatalog() {
  if (!catalog) catalog = await loadJSON('data/rulesets.json', []);
  return catalog;
}

export async function getCategories() {
  if (!categories) {
    const raw = await loadJSON('data/categories.json', {});
    categories = new Map();
    for (const [cat, list] of Object.entries(raw)) for (const d of list) categories.set(d, cat);
  }
  return categories;
}

export async function categoryOf(host) {
  const map = await getCategories();
  for (const k of hostKeys(host)) { const c = map.get(k); if (c) return c; }
  return null;
}

// ---------------------------------------------------------------------------
// Cosmetic index
// ---------------------------------------------------------------------------
const SIMPLE_RE = /^(?:[a-z][a-z0-9]*)?([.#][\w-]+)(?=$|[.#:\[\s>+~,])/i;

function buildIndex(cos) {
  const idx = {
    simple: new Map(), complex: [], specific: new Map(), exceptions: new Map(),
    procedural: new Map(), styles: new Map(), scriptlets: new Map(), scriptletExceptions: new Map(),
    hideAll: new Set(cos.hide.all), hideGeneric: new Set(cos.hide.generic), hideSpecific: new Set(cos.hide.specific),
    globalExceptions: new Set(cos.exceptions['*'] || []),
    cssCache: new Map(),
  };
  const seen = new Set();
  for (const sel of cos.generic) {
    if (seen.has(sel) || idx.globalExceptions.has(sel)) continue;
    seen.add(sel);
    const m = sel.match(SIMPLE_RE);
    if (m && !sel.includes(',')) {
      const key = m[1];
      if (!idx.simple.has(key)) idx.simple.set(key, []);
      idx.simple.get(key).push(sel);
    } else idx.complex.push(sel);
  }
  const toMap = (obj, map, asSet = false) => {
    for (const [k, v] of Object.entries(obj)) {
      if (k === '*' && asSet) continue;
      if (asSet) { const s = map.get(k) || new Set(); v.forEach(x => s.add(x)); map.set(k, s); }
      else {
        const arr = map.get(k) || [];
        const sigs = new Set(arr.map(x => typeof x === 'string' ? x : JSON.stringify(x)));
        for (const x of v) {
          const sig = typeof x === 'string' ? x : JSON.stringify(x);
          if (!sigs.has(sig)) { sigs.add(sig); arr.push(x); }
        }
        map.set(k, arr);
      }
    }
  };
  toMap(cos.specific, idx.specific);
  toMap(cos.exceptions, idx.exceptions, true);
  toMap(cos.procedural, idx.procedural);
  toMap(cos.styles, idx.styles);
  toMap(cos.scriptlets, idx.scriptlets);
  for (const [k, v] of Object.entries(cos.scriptletExceptions)) idx.scriptletExceptions.set(k, new Set(v));
  return idx;
}

/**
 * (Re)build the index from: enabled bundled lists + remote delta + user filters.
 */
export async function rebuildCosmetic(enabledIds, extra = []) {
  const key = JSON.stringify([enabledIds, extra.map(e => e?.__v || 0)]);
  if (index && key === indexKey) return index;
  const merged = emptyCosmetic();
  const cat = await getCatalog();
  await Promise.all(cat.filter(r => enabledIds.includes(r.id) && r.cosmetic).map(async r => {
    const c = await loadJSON(`data/cosmetic/${r.id}.json`);
    if (c) mergeCosmetic(merged, c);
  }));
  for (const e of extra) mergeCosmetic(merged, e);
  index = buildIndex(merged);
  indexKey = key;
  console.info('[WipeAd] cosmetic index:', index.simple.size, 'simple keys,', index.complex.length, 'complex,', index.specific.size, 'sites');
  return index;
}

export function getIndex() { return index; }

function collect(map, keys) {
  const out = [];
  for (const k of keys) { const v = map.get(k); if (v) out.push(...v); }
  return out;
}

function exceptionsFor(idx, keys) {
  const ex = new Set(idx.globalExceptions);
  for (const k of keys) { const s = idx.exceptions.get(k); if (s) s.forEach(x => ex.add(x)); }
  return ex;
}

/** Everything the content script / injector needs for a frame. */
export function cosmeticFor(host) {
  const idx = index;
  if (!idx) return null;
  const keys = hostKeys(host);
  const disabledAll = keys.some(k => idx.hideAll.has(k));
  if (disabledAll) return { disabled: true };
  const noGeneric = keys.some(k => idx.hideGeneric.has(k));
  const noSpecific = keys.some(k => idx.hideSpecific.has(k));
  const ex = exceptionsFor(idx, keys);
  let cached = idx.cssCache.get(host);
  if (!cached) {
    const specific = noSpecific ? [] : collect(idx.specific, keys).filter(s => !ex.has(s));
    const complex = noGeneric ? [] : (ex.size ? idx.complex.filter(s => !ex.has(s)) : idx.complex);
    const styles = noSpecific ? [] : collect(idx.styles, keys);
    const procedural = noSpecific ? [] : collect(idx.procedural, keys).filter(s => !ex.has(s));
    cached = { specific, complex, styles, procedural, exceptions: [...ex], noGeneric };
    if (idx.cssCache.size > 300) idx.cssCache.clear();
    idx.cssCache.set(host, cached);
  }
  return cached;
}

/** Generic selectors matching the class/id tokens found in the page. */
export function genericForTokens(host, tokens) {
  const idx = index;
  if (!idx) return [];
  const ex = exceptionsFor(idx, hostKeys(host));
  const out = [];
  for (const t of tokens) {
    const list = idx.simple.get(t);
    if (!list) continue;
    for (const s of list) if (!ex.has(s)) out.push(s);
  }
  return out;
}

export function scriptletsFor(host) {
  const idx = index;
  if (!idx) return [];
  const keys = hostKeys(host);
  const ex = new Set();
  for (const k of [...keys, '*']) { const s = idx.scriptletExceptions.get(k); if (s) s.forEach(x => ex.add(x)); }
  if (ex.has('*')) return [];
  const seen = new Set();
  const out = [];
  for (const item of collect(idx.scriptlets, keys)) {
    if (ex.has(item[0])) continue;
    const sig = JSON.stringify(item);
    if (seen.has(sig)) continue;
    seen.add(sig); out.push(item);
  }
  return out;
}
