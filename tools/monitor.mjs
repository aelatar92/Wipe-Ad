// Wipe Ad live monitor (development only). Receives diagnostics from a developer install
// of the extension and appends them to monitor/events.jsonl. Listens on 127.0.0.1 only.
//   node tools/monitor.mjs
import { createServer } from 'node:http';
import { appendFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIR = join(ROOT, 'monitor');
const FILE = join(DIR, 'events.jsonl');
mkdirSync(DIR, { recursive: true });
let total = 0;

createServer((req, res) => {
  // the extension's origin is chrome-extension://…; allow it (local-only server)
  res.setHeader('access-control-allow-origin', '*');
  res.setHeader('access-control-allow-headers', 'content-type');
  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
  if (req.method !== 'POST' || req.url !== '/ingest') { res.writeHead(404); return res.end(); }
  let body = '';
  req.on('data', c => { body += c; if (body.length > 2e6) req.destroy(); });
  req.on('end', () => {
    try {
      const events = JSON.parse(body);
      for (const e of Array.isArray(events) ? events : [events]) {
        appendFileSync(FILE, JSON.stringify(e) + '\n');
        total++;
        if (e.level === 'error' || e.level === 'warn') console.log(`[${new Date(e.t).toLocaleTimeString()}] ${e.level.toUpperCase()} ${e.kind} ${e.host || ''} ${e.message || ''} ${e.ms ? e.ms + 'ms' : ''}`);
      }
    } catch { /* ignore malformed */ }
    res.writeHead(204); res.end();
  });
}).listen(47321, '127.0.0.1', () => console.log(`Wipe Ad monitor on http://127.0.0.1:47321 → ${FILE}`));

setInterval(() => console.log(`… ${total} events so far`), 60000).unref();
