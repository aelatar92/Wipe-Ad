// Wipe Ad build: downloads filter lists, compiles them to DNR rulesets + cosmetic data,
// then assembles dist/chromium and dist/firefox (+ zip packages).
//
//   node tools/build.mjs                 fetch lists (cached 12h) and build all targets
//   node tools/build.mjs --offline       use cached lists only
//   node tools/build.mjs --selfhosted    add update_url for self-hosted Chromium/Edge distribution
import { mkdirSync, rmSync, cpSync, writeFileSync, readFileSync, existsSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { LISTS, PSL_URL } from './lists.config.mjs';
import { compileFilters, preprocess } from '../src/shared/filter-parser.js';
import { CONFIG } from '../src/shared/config.js';
import { zipDirectory } from './zip.mjs';
import { validateRegexes } from './regex-validator.mjs';
import { lineHash } from './make-delta.mjs';
import { gzipSync } from 'node:zlib';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CACHE = join(ROOT, '.cache', 'lists');
const BUILD = join(ROOT, 'build');
const DIST = join(ROOT, 'dist');
const args = new Set(process.argv.slice(2));
const OFFLINE = args.has('--offline');
const SELFHOSTED = args.has('--selfhosted');
const MAX_AGE = 12 * 3600 * 1000;
const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));

mkdirSync(CACHE, { recursive: true });

async function fetchText(url, cacheName) {
  const file = join(CACHE, cacheName);
  if (existsSync(file) && (OFFLINE || Date.now() - statSync(file).mtimeMs < MAX_AGE)) return readFileSync(file, 'utf8');
  if (OFFLINE) throw new Error(`offline and not cached: ${url}`);
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 60000);
      const r = await fetch(url, { headers: { 'user-agent': 'WipeAd-Builder/1.0' }, signal: ctrl.signal });
      clearTimeout(timer);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const text = await r.text();
      writeFileSync(file, text);
      return text;
    } catch (e) {
      if (attempt === 3) {
        if (existsSync(file)) { console.warn(`  ! ${url}: ${e.message} — using stale cache`); return readFileSync(file, 'utf8'); }
        throw new Error(`${url}: ${e.message}`);
      }
    }
  }
}

const safeName = u => u.replace(/^https?:\/\//, '').replace(/[^a-z0-9.]+/gi, '_').slice(0, 150);

// resolves uBlock "!#include" directives (same origin only)
async function fetchList(url, depth = 0) {
  const text = await fetchText(url, safeName(url));
  if (depth > 2 || !text.includes('!#include')) return text;
  const out = [];
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^!#include\s+(\S+)/);
    if (m) {
      const sub = new URL(m[1], url);
      if (sub.origin === new URL(url).origin) { try { out.push(await fetchList(sub.href, depth + 1)); } catch (e) { console.warn('  ! include', e.message); } }
      continue;
    }
    out.push(line);
  }
  return out.join('\n');
}

function compilePSL(text) {
  const r = [], w = [], e = [];
  for (let line of text.split(/\r?\n/)) {
    line = line.trim();
    if (!line || line.startsWith('//')) continue;
    line = line.split(/\s/)[0].toLowerCase();
    if (line.startsWith('!')) e.push(line.slice(1));
    else if (line.startsWith('*.')) w.push(line.slice(2));
    else r.push(line);
  }
  return { r, w, e };
}

function cosmeticCount(c) {
  let n = c.generic.length;
  for (const k of ['specific', 'procedural', 'styles', 'scriptlets']) for (const v of Object.values(c[k])) n += v.length;
  return n;
}

async function main() {
  console.log(`Wipe Ad ${pkg.version} — build${OFFLINE ? ' (offline)' : ''}`);
  rmSync(BUILD, { recursive: true, force: true });
  mkdirSync(join(BUILD, 'rulesets'), { recursive: true });
  mkdirSync(join(BUILD, 'data', 'cosmetic'), { recursive: true });

  // Public suffix list
  const psl = compilePSL(await fetchText(PSL_URL, 'public_suffix_list.dat'));
  writeFileSync(join(BUILD, 'data', 'psl.json'), JSON.stringify(psl));
  console.log(`  PSL: ${psl.r.length + psl.w.length + psl.e.length} rules`);

  const catalog = [];
  const categories = { m: new Set(), t: new Set(), a: new Set(), n: new Set(), s: new Set() };
  let totalRules = 0;
  const compiled = [];
  const baseline = new Set();
  for (const list of LISTS) {
    let text = '';
    try {
      const parts = [];
      for (const u of list.urls) parts.push(await fetchList(u));
      text = parts.join('\n');
    } catch (e) {
      console.warn(`  ! skipping ${list.id}: ${e.message}`);
      continue;
    }
    const lines = preprocess(text);
    for (const l of lines) { const t = l.trim(); if (t && !t.startsWith('!')) baseline.add(lineHash(t)); }
    const res = compileFilters(lines, { forceAllTypes: !!list.forceAllTypes, maxRegex: 900 });
    compiled.push({ list, res });
  }

  // validate every regexFilter with the browser's RE2 engine
  const allRegex = compiled.flatMap(({ res }) => res.rules.filter(r => r.condition.regexFilter).map(r => ({ regex: r.condition.regexFilter, caseSensitive: r.condition.isUrlFilterCaseSensitive })));
  const isOk = await validateRegexes(allRegex, join(ROOT, '.cache', 'regex-validation.json'));
  let droppedRegex = 0;
  for (const { res } of compiled) {
    const before = res.rules.length;
    res.rules = res.rules.filter(r => !r.condition.regexFilter || isOk(r.condition.regexFilter, r.condition.isUrlFilterCaseSensitive));
    droppedRegex += before - res.rules.length;
    res.rules.forEach((r, i) => { r.id = i + 1; });
  }
  console.log(`  regex rules: ${allRegex.length} checked, ${droppedRegex} rejected by RE2`);

  for (const { list, res } of compiled) {
    for (const d of res.domains) categories[list.category]?.add(d);
    const hasDnr = res.rules.length > 0;
    if (hasDnr) writeFileSync(join(BUILD, 'rulesets', `${list.id}.json`), JSON.stringify(res.rules));
    const cc = cosmeticCount(res.cosmetic);
    if (cc || res.cosmetic.hide.all.length || Object.keys(res.cosmetic.exceptions).length) {
      writeFileSync(join(BUILD, 'data', 'cosmetic', `${list.id}.json`), JSON.stringify(res.cosmetic));
    }
    totalRules += list.enabled ? res.rules.length : 0;
    catalog.push({ id: list.id, name: list.name, group: list.group, category: list.category, enabled: list.enabled, home: list.home,
      lang: list.lang || null, dnr: hasDnr, cosmetic: cc > 0, rules: res.rules.length, cosmeticCount: cc, filters: res.stats.total, unsupported: res.stats.unsupported });
    console.log(`  ${list.id.padEnd(20)} ${String(res.stats.total).padStart(7)} filters → ${String(res.rules.length).padStart(6)} DNR, ${String(cc).padStart(6)} cosmetic, ${String(res.stats.unsupported).padStart(5)} unsupported`);
  }
  // categories: malware > tracking > ads > annoyance > social (each domain listed once)
  const seen = new Set();
  const catOut = {};
  for (const k of ['m', 't', 'a', 'n', 's']) { catOut[k] = [...categories[k]].filter(d => !seen.has(d)); catOut[k].forEach(d => seen.add(d)); }
  writeFileSync(join(BUILD, 'data', 'categories.json'), JSON.stringify(catOut));
  writeFileSync(join(BUILD, 'data', 'rulesets.json'), JSON.stringify(catalog, null, 1));
  writeFileSync(join(BUILD, 'baseline.txt.gz'), gzipSync([...baseline].join('\n')));
  console.log(`  enabled-by-default DNR rules: ${totalRules}`);

  // assemble targets
  rmSync(DIST, { recursive: true, force: true });
  for (const target of ['chromium', 'firefox']) {
    const out = join(DIST, target);
    cpSync(join(ROOT, 'src'), out, { recursive: true });
    cpSync(join(BUILD, 'rulesets'), join(out, 'rulesets'), { recursive: true });
    cpSync(join(BUILD, 'data'), join(out, 'data'), { recursive: true });
    const manifest = JSON.parse(readFileSync(join(ROOT, 'src', 'manifest.json'), 'utf8'));
    manifest.version = pkg.version;
    manifest.declarative_net_request.rule_resources = catalog.filter(c => c.dnr).map(c => ({ id: c.id, enabled: c.enabled, path: `rulesets/${c.id}.json` }));
    if (target === 'firefox') {
      manifest.background = { scripts: ['background/index.js'], type: 'module' };
      delete manifest.minimum_chrome_version;
      manifest.optional_permissions = manifest.optional_permissions.filter(p => p !== 'contentSettings');
      manifest.browser_specific_settings = { gecko: { id: 'wipe-ad@wipe-ad.app', strict_min_version: '128.0',
        update_url: `${CONFIG.UPDATE_BASE}/firefox-updates.json`, data_collection_permissions: { required: ['none'] } } };
    } else if (SELFHOSTED) {
      manifest.update_url = `${CONFIG.UPDATE_BASE}/chromium-updates.xml`;
    }
    writeFileSync(join(out, 'manifest.json'), JSON.stringify(manifest, null, 2));
    const zip = join(DIST, `wipe-ad-${pkg.version}-${target}.zip`);
    const z = zipDirectory(out, zip);
    console.log(`  ${target}: ${z.files} files, ${(z.bytes / 1048576).toFixed(1)} MB → ${zip}`);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
