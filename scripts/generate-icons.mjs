import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { deflateSync } from 'node:zlib';
import { spawnSync } from 'node:child_process';

// Original, deterministic vector-style icon artwork. No font or remote asset
// is required, and the menu-bar image stays monochrome for macOS template tinting.
const assets = resolve(import.meta.dirname, '../desktop/assets');
mkdirSync(assets, { recursive: true });

const crcTable = new Uint32Array(256);
for (let n = 0; n < 256; n += 1) {
  let value = n;
  for (let k = 0; k < 8; k += 1) value = (value & 1) ? (0xedb88320 ^ (value >>> 1)) : (value >>> 1);
  crcTable[n] = value >>> 0;
}
function crc32(buffer) {
  let crc = 0xffffffff;
  for (const value of buffer) crc = crcTable[(crc ^ value) & 255] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const body = Buffer.concat([Buffer.from(type), data]);
  const length = Buffer.alloc(4);
  const crc = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}
function png(size, pixels) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8;
  header[9] = 6;
  const rows = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y += 1) pixels.copy(rows, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', header), chunk('IDAT', deflateSync(rows)), chunk('IEND', Buffer.alloc(0))]);
}
function roundedRect(x, y, left, top, width, height, radius) {
  const dx = Math.abs(x - left - width / 2) - width / 2 + radius;
  const dy = Math.abs(y - top - height / 2) - height / 2 + radius;
  return Math.hypot(Math.max(dx, 0), Math.max(dy, 0)) + Math.min(Math.max(dx, dy), 0) - radius;
}
function segment(x, y, ax, ay, bx, by, width) {
  const dx = bx - ax;
  const dy = by - ay;
  const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(x - (ax + t * dx), y - (ay + t * dy)) - width / 2;
}
function markDistance(x, y) {
  return Math.min(
    roundedRect(x, y, 2, 2, 6.5, 6.5, 1.8),
    roundedRect(x, y, 11.5, 2, 6.5, 6.5, 1.8),
    roundedRect(x, y, 2, 11.5, 6.5, 6.5, 1.8),
    segment(x, y, 11.5, 14.2, 13.7, 16.5, 2.1),
    segment(x, y, 13.7, 16.5, 18.2, 11.3, 2.1)
  );
}
function render(size, appIcon = false) {
  const pixels = Buffer.alloc(size * size * 4);
  const aa = 20 / size;
  for (let py = 0; py < size; py += 1) {
    for (let px = 0; px < size; px += 1) {
      const x = (px + 0.5) * 20 / size;
      const y = (py + 0.5) * 20 / size;
      const offset = (py * size + px) * 4;
      const coverage = (distance) => Math.max(0, Math.min(1, 0.5 - distance / aa));
      if (!appIcon) {
        pixels[offset + 3] = Math.round(255 * coverage(markDistance(x, y)));
        continue;
      }
      const alpha = coverage(roundedRect(x, y, 0.7, 0.7, 18.6, 18.6, 4.35));
      const gradient = Math.min(1, Math.max(0, (x * 0.6 + y) / 30));
      const glow = Math.max(0, 1 - Math.hypot(x - 5, y - 3) / 16) * 26;
      const color = [46 + gradient * 19 + glow, 61 + gradient * 28 + glow, 71 + gradient * 44 + glow];
      const mark = coverage(markDistance((x - 4) / 0.6, (y - 4) / 0.6) * 0.6);
      for (let channel = 0; channel < 3; channel += 1) pixels[offset + channel] = Math.round(color[channel] * (1 - mark) + [230, 243, 243][channel] * mark);
      pixels[offset + 3] = Math.round(alpha * 255);
    }
  }
  return png(size, pixels);
}

writeFileSync(join(assets, 'trayTemplate.png'), render(20));
writeFileSync(join(assets, 'trayTemplate@2x.png'), render(40));
writeFileSync(join(assets, 'app.png'), render(1024, true));
if (process.platform === 'darwin') {
  const iconset = join(assets, 'app.iconset');
  mkdirSync(iconset, { recursive: true });
  for (const points of [16, 32, 128, 256, 512]) {
    for (const scale of [1, 2]) {
      writeFileSync(join(iconset, `icon_${points}x${points}${scale === 2 ? '@2x' : ''}.png`), render(points * scale, true));
    }
  }
  const result = spawnSync('/usr/bin/iconutil', ['--convert', 'icns', '--output', join(assets, 'app.icns'), iconset], { encoding: 'utf8' });
  rmSync(iconset, { recursive: true, force: true });
  if (result.status !== 0) throw new Error(result.stderr || 'Could not create the macOS icon');
}
console.log('Generated original tray template images and app icon.');
