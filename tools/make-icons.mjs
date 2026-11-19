// Generates Wipe Ad icons (PNG) and binary redirect resources without external dependencies.
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', 'src');

const CRC = new Int32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c; });
const crc32 = buf => { let c = -1; for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ -1) >>> 0; };
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
export function encodePNG(w, h, rgba) {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) { raw[y * (w * 4 + 1)] = 0; rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4); }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

const clamp = v => Math.max(0, Math.min(1, v));
function segDist(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay; const t = clamp(((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy));
  return Math.hypot(px - ax - t * dx, py - ay - t * dy);
}
function roundRectDist(px, py, r) { // centered square [-0.5,0.5]
  const qx = Math.abs(px) - (0.5 - r), qy = Math.abs(py) - (0.5 - r);
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r;
}

function drawIcon(size, off) {
  const buf = Buffer.alloc(size * size * 4);
  const W = [[0.2, 0.32], [0.355, 0.7], [0.5, 0.44], [0.645, 0.7], [0.8, 0.32]];
  const stroke = size <= 16 ? 0.085 : 0.07;
  const aa = 1.2 / size;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const u = (x + 0.5) / size, v = (y + 0.5) / size;
    const bg = clamp(0.5 - roundRectDist(u - 0.5, v - 0.5, 0.22) / aa);
    let d = Infinity;
    for (let i = 0; i < W.length - 1; i++) d = Math.min(d, segDist(u, v, ...W[i], ...W[i + 1]));
    // the "wipe" swoosh under the W
    d = Math.min(d, segDist(u, v, 0.28, 0.82, 0.72, 0.82) + 0.025);
    const fg = clamp(0.5 - (d - stroke) / aa);
    const t = clamp((u + v) / 2);
    let r, g, b;
    if (off) { r = 0x6b + (0x9c - 0x6b) * t; g = 0x72 + (0xa3 - 0x72) * t; b = 0x80 + (0xaf - 0x80) * t; }
    else { r = 0x7c + (0x06 - 0x7c) * t; g = 0x3a + (0xb6 - 0x3a) * t; b = 0xed + (0xd4 - 0xed) * t; }
    const i = (y * size + x) * 4;
    buf[i] = Math.round(r * (1 - fg) + 255 * fg);
    buf[i + 1] = Math.round(g * (1 - fg) + 255 * fg);
    buf[i + 2] = Math.round(b * (1 - fg) + 255 * fg);
    buf[i + 3] = Math.round(255 * bg);
  }
  return encodePNG(size, size, buf);
}

mkdirSync(join(ROOT, 'icons'), { recursive: true });
for (const s of [16, 32, 48, 128]) {
  writeFileSync(join(ROOT, 'icons', `icon-${s}.png`), drawIcon(s, false));
  writeFileSync(join(ROOT, 'icons', `icon-${s}-off.png`), drawIcon(s, true));
}
mkdirSync(join(ROOT, 'resources'), { recursive: true });
writeFileSync(join(ROOT, 'resources', '1x1.gif'), Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64'));
writeFileSync(join(ROOT, 'resources', '2x2.png'), encodePNG(2, 2, Buffer.alloc(16)));
console.log('icons + binary resources written');
