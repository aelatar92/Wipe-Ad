// Generates live rule updates ("delta lists") for the auto-update channel.
// Compares today's upstream filter lists with the baseline bundled in the last release
// and publishes only the NEW filters under updates/filters/. Runs daily in GitHub Actions.
//
//   node tools/make-delta.mjs
import { readFileSync, writeFileSync, existsSync, mkdirSync, rmSync, readdirSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { LISTS } from './lists.config.mjs';
import { preprocess, parseLine } from '../src/shared/filter-parser.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'updates', 'filters');
const BASELINE = join(OUT, 'baseline.txt.gz');
const MAX_DELTA = 20000; // above this, cut a new release instead

export const ALWAYS_LISTS = [['wipead-fixes', 'wipead-fixes.txt'], ['wipead-youtube', 'youtube.txt']];
export function alwaysLists(dir) {
  return ALWAYS_LISTS.filter(([, f]) => existsSync(join(dir, f))).map(([id, f]) => {
    const body = readFileSync(join(dir, f), 'utf8');
    return { id, ruleset: null, url: f, sha256: createHash('sha256').update(body).digest('hex'), lines: body.split('\n').length };
  });
}

export const lineHash = l => createHash('sha1').update(l.trim()).digest('hex').slice(0, 12);

async function fetchText(url) {
  const r = await fetch(url, { headers: { 'user-agent': 'WipeAd-Delta/1.0' } });
  if (!r.ok) throw new Error(`HTTP ${r.status} ${url}`);
  return r.text();
}

async function main() {
  if (!existsSync(BASELINE)) { console.error('No baseline — run `npm run release` first.'); process.exit(1); }
  const baseline = new Set(gunzipSync(readFileSync(BASELINE)).toString('utf8').split('\n'));
  mkdirSync(OUT, { recursive: true });
  for (const f of readdirSync(OUT)) if (f.startsWith('delta-')) rmSync(join(OUT, f));

  const lists = [];
  let total = 0;
  for (const list of LISTS.filter(l => !l.urls.some(u => u.startsWith('local:')))) {
    let text;
    try { text = (await Promise.all(list.urls.map(fetchText))).join('\n'); }
    catch (e) { console.warn(`! ${list.id}: ${e.message}`); continue; }
    const fresh = [];
    for (const line of preprocess(text)) {
      const t = line.trim();
      if (!t || t.startsWith('!') || t.startsWith('[')) continue;
      if (baseline.has(lineHash(t))) continue;
      const f = parseLine(t);
      if (!f || f.kind === 'unsupported') continue;
      fresh.push(t);
    }
    if (!fresh.length) continue;
    const body = fresh.join('\n') + '\n';
    const file = `delta-${list.id}.txt`;
    writeFileSync(join(OUT, file), body);
    lists.push({ id: list.id, ruleset: list.id, url: file, sha256: createHash('sha256').update(body).digest('hex'), lines: fresh.length });
    total += fresh.length;
    console.log(`  ${list.id.padEnd(20)} +${fresh.length}`);
  }
  // hand-written lists (hot fixes, YouTube), always applied
  lists.push(...alwaysLists(OUT));
  const prev = existsSync(join(OUT, 'manifest.json')) ? JSON.parse(readFileSync(join(OUT, 'manifest.json'), 'utf8')) : {};
  const manifest = {
    version: new Date().toISOString().replace(/[-:T]/g, '').slice(0, 12),
    generated: new Date().toISOString(),
    baselineVersion: prev.baselineVersion || null,
    lists,
    yellowlist: prev.yellowlist || [],
    consentRules: prev.consentRules || [],
    notice: prev.notice || null,
  };
  writeFileSync(join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 1));
  console.log(`delta: ${total} new filters → updates/filters/manifest.json (${manifest.version})`);
  if (total > MAX_DELTA) {
    console.log(`::warning::Delta is large (${total}). Cut a new release so the filters are bundled statically.`);
    writeFileSync(join(OUT, 'NEEDS_RELEASE'), String(total));
  }
}

if (process.argv[1]?.endsWith('make-delta.mjs')) main().catch(e => { console.error(e); process.exit(1); });
