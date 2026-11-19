// Validates DNR regexFilter values with the browser's own RE2 engine (isRegexSupported).
// One invalid regex makes Chrome refuse the whole static ruleset, so this is essential.
import { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { findChromium, launchWithExtension, findServiceWorker } from './cdp.mjs';

// Heuristic pre-filter (used alone when no Chromium is available)
export function regexLooksSafe(re) {
  if (re.length > 250) return false;
  if (/\(\?[=!<]|\\[1-9]|\(\?<|\\[pPhHvVRXK]|\*\+|\+\+|\?\+|\(\?[a-z]*\)/.test(re)) return false;
  for (const m of re.matchAll(/\{(\d+)(?:,(\d*))?\}/g)) { if (+m[1] > 60 || (m[2] && +m[2] > 60)) return false; }
  return true;
}

export async function validateRegexes(list, cacheFile) {
  const cache = existsSync(cacheFile) ? JSON.parse(readFileSync(cacheFile, 'utf8')) : {};
  const unique = [...new Set(list.map(x => JSON.stringify([x.regex, !!x.caseSensitive])))].map(s => JSON.parse(s));
  const todo = unique.filter(([re, cs]) => !(JSON.stringify([re, cs]) in cache) && regexLooksSafe(re));
  const chrome = findChromium();
  if (todo.length && chrome) {
    const dir = mkdtempSync(join(tmpdir(), 'wipead-regex-'));
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'manifest.json'), JSON.stringify({ manifest_version: 3, name: 'regex-check', version: '1', permissions: ['declarativeNetRequest'], background: { service_worker: 'sw.js' } }));
    writeFileSync(join(dir, 'sw.js'), 'self.check = async (list) => { const out = []; for (const [regex, cs] of list) { try { const r = await chrome.declarativeNetRequest.isRegexSupported({ regex, isCaseSensitive: cs }); out.push(r.isSupported); } catch { out.push(false); } } return out; };');
    const b = await launchWithExtension(chrome, dir, 9341);
    try {
      const sw = await findServiceWorker(b.cdp, '/sw.js');
      if (!sw) throw new Error('validator service worker not found');
      const { sessionId } = await b.cdp.send('Target.attachToTarget', { targetId: sw.targetId, flatten: true });
      for (let i = 0; i < todo.length; i += 200) {
        const batch = todo.slice(i, i + 200);
        const res = await b.cdp.eval(sessionId, `self.check(${JSON.stringify(batch)})`);
        batch.forEach((k, j) => { cache[JSON.stringify(k)] = res[j]; });
      }
    } finally { await b.close(); rmSync(dir, { recursive: true, force: true }); }
    writeFileSync(cacheFile, JSON.stringify(cache));
  } else if (todo.length) {
    console.warn('  ! Chromium not found — regex rules validated heuristically only (set WIPEAD_CHROMIUM)');
  }
  return (re, cs) => {
    const k = JSON.stringify([re, !!cs]);
    if (k in cache) return cache[k];
    return chrome ? false : regexLooksSafe(re);
  };
}
