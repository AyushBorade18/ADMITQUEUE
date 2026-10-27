// Generates the PWA icons (PNG) into public/icons without any image library.
//   node scripts/make-icons.mjs
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const out = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'public', 'icons');
mkdirSync(out, { recursive: true });

const BRAND = [15, 92, 120];
const WHITE = [255, 255, 255];
const ACCENT = [244, 182, 66];

function crc32(buf) {
  let c;
  const table = [];
  for (let n = 0; n < 256; n++) {
    c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  let crc = 0xffffffff;
  for (const b of buf) crc = table[(crc ^ b) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(size, rgba) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

// signed-distance helpers in unit coordinates (0..1)
const inRoundRect = (x, y, x0, y0, x1, y1, r) => {
  const cx = Math.min(Math.max(x, x0 + r), x1 - r);
  const cy = Math.min(Math.max(y, y0 + r), y1 - r);
  return (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
};
const inCircle = (x, y, cx, cy, r) => (x - cx) ** 2 + (y - cy) ** 2 <= r * r;

// the motif: a queue of three people (dot + bar) waiting, the first one highlighted
function motif(x, y, s, o) {
  // s = scale around the centre, o = offset
  const u = (x - 0.5) / s + 0.5;
  const v = (y - 0.5) / s + 0.5;
  for (let i = 0; i < 3; i++) {
    const cy = 0.3 + i * 0.2;
    const len = 0.46 - i * 0.1;
    if (inCircle(u, v, 0.27, cy, 0.065)) return i === 0 ? ACCENT : WHITE;
    if (inRoundRect(u, v, 0.38, cy - 0.04, 0.38 + len, cy + 0.04, 0.04)) return WHITE;
  }
  return null;
}

function render(size, { maskable }) {
  const buf = Buffer.alloc(size * size * 4);
  const SS = 3;
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const x = (px + (sx + 0.5) / SS) / size;
          const y = (py + (sy + 0.5) / SS) / size;
          const inside = maskable ? true : inRoundRect(x, y, 0.02, 0.02, 0.98, 0.98, 0.2);
          if (!inside) continue;
          const m = motif(x, y, maskable ? 0.72 : 0.92, 0);
          const c = m || BRAND;
          r += c[0]; g += c[1]; b += c[2]; a += 255;
        }
      }
      const n = SS * SS;
      const covered = a / 255;
      const i = (py * size + px) * 4;
      buf[i] = covered ? Math.round(r / covered) : 0;
      buf[i + 1] = covered ? Math.round(g / covered) : 0;
      buf[i + 2] = covered ? Math.round(b / covered) : 0;
      buf[i + 3] = Math.round((covered / n) * 255);
    }
  }
  return png(size, buf);
}

writeFileSync(path.join(out, 'icon-192.png'), render(192, { maskable: false }));
writeFileSync(path.join(out, 'icon-512.png'), render(512, { maskable: false }));
writeFileSync(path.join(out, 'icon-maskable-512.png'), render(512, { maskable: true }));
writeFileSync(path.join(out, 'apple-touch-icon.png'), render(180, { maskable: true }));
console.log('Icons written to public/icons');
