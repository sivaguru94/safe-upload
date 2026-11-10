import { concat, encodeAscii, latin1, putU32le, startsWith, u32le } from './bytes.js';
import { Collector } from './collect.js';
import { buildTiff, parseTiff, tiffCategories } from './exif.js';
import type { FormatStrip } from './jpeg.js';
import type { Category } from './types.js';
import { analyzeXmp } from './xmp.js';

export function isWebp(b: Uint8Array): boolean {
  return b.length >= 16 && startsWith(b, 0, 'RIFF') && startsWith(b, 8, 'WEBP');
}

interface Chunk {
  fourcc: string;
  start: number;
  end: number;
  data: Uint8Array;
}

function chunks(b: Uint8Array): Chunk[] {
  const out: Chunk[] = [];
  const riffEnd = Math.min(b.length, 8 + u32le(b, 4));
  let p = 12;
  while (p + 8 <= riffEnd) {
    const fourcc = latin1(b, p, p + 4);
    const size = u32le(b, p + 4);
    const dataEnd = p + 8 + size;
    if (dataEnd > b.length) throw new Error('Corrupt WebP: chunk runs past the end of the file');
    const end = dataEnd + (size & 1);
    out.push({ fourcc, start: p, end: Math.min(end, b.length), data: b.subarray(p + 8, dataEnd) });
    p = end;
  }
  return out;
}

const tiffOf = (d: Uint8Array) => (startsWith(d, 0, 'Exif\0\0') ? d.subarray(6) : d);

export function inspectWebp(b: Uint8Array, c: Collector): void {
  for (const ch of chunks(b)) {
    const d = ch.data;
    if (ch.fourcc === 'VP8X' && d.length >= 10) {
      c.report.width = 1 + (d[4] | (d[5] << 8) | (d[6] << 16));
      c.report.height = 1 + (d[7] | (d[8] << 8) | (d[9] << 16));
    } else if (ch.fourcc === 'VP8 ' && d.length >= 10 && !c.report.width) {
      c.report.width = (d[6] | (d[7] << 8)) & 0x3fff;
      c.report.height = (d[8] | (d[9] << 8)) & 0x3fff;
    } else if (ch.fourcc === 'VP8L' && d.length >= 5 && !c.report.width) {
      const bits = d[1] | (d[2] << 8) | (d[3] << 16) | (d[4] << 24);
      c.report.width = (bits & 0x3fff) + 1;
      c.report.height = ((bits >> 14) & 0x3fff) + 1;
    } else if (ch.fourcc === 'EXIF') c.tiff(tiffOf(d), 'exif');
    else if (ch.fourcc === 'XMP ') c.xmp(d, 'xmp');
    else if (!['VP8 ', 'VP8L', 'VP8X', 'ALPH', 'ANIM', 'ANMF', 'ICCP'].includes(ch.fourcc)) {
      c.add({ category: 'other', source: 'webp', key: `webp.${ch.fourcc.trim()}`, label: `Extra chunk "${ch.fourcc.trim()}"`, value: `${d.length.toLocaleString('en')} bytes`, removable: true });
    }
  }
}

function chunkBytes(fourcc: string, data: Uint8Array): Uint8Array {
  const pad = data.length & 1;
  const out = new Uint8Array(8 + data.length + pad);
  out.set(encodeAscii(fourcc), 0);
  putU32le(out, 4, data.length);
  out.set(data, 8);
  return out;
}

export function stripWebp(b: Uint8Array, remove: Set<Category>): FormatStrip {
  const removed = new Set<Category>();
  const notes: string[] = [];
  const kept: Uint8Array[] = [];
  let vp8x: { index: number; data: Uint8Array } | undefined;
  let hasExif = false;
  let hasXmp = false;
  for (const ch of chunks(b)) {
    const raw = b.subarray(ch.start, ch.end);
    if (ch.fourcc === 'VP8X') {
      vp8x = { index: kept.length, data: ch.data.slice() };
      kept.push(raw);
    } else if (ch.fourcc === 'EXIF') {
      const tiff = parseTiff(tiffOf(ch.data));
      if (!tiff) {
        if (remove.has('other')) removed.add('other');
        else {
          kept.push(raw);
          hasExif = true;
        }
        continue;
      }
      if (![...tiffCategories(tiff)].some((c) => remove.has(c))) {
        kept.push(raw);
        hasExif = true;
        continue;
      }
      const r = buildTiff(tiff, { remove });
      r.removed.forEach((c) => removed.add(c));
      notes.push(...r.notes);
      if (r.bytes) {
        kept.push(chunkBytes('EXIF', r.bytes));
        hasExif = true;
      }
    } else if (ch.fourcc === 'XMP ') {
      const hits = [...analyzeXmp(new TextDecoder().decode(ch.data)).categories].filter((c) => remove.has(c));
      if (hits.length) {
        hits.forEach((c) => removed.add(c));
        notes.push('The XMP metadata block was removed as a whole.');
      } else {
        kept.push(raw);
        hasXmp = true;
      }
    } else if (!['VP8 ', 'VP8L', 'ALPH', 'ANIM', 'ANMF', 'ICCP'].includes(ch.fourcc) && remove.has('other')) {
      removed.add('other');
    } else kept.push(raw);
  }
  if (vp8x) {
    const d = vp8x.data;
    d[0] = (d[0] & ~0x0c) | (hasExif ? 0x08 : 0) | (hasXmp ? 0x04 : 0);
    kept[vp8x.index] = chunkBytes('VP8X', d);
  }
  const body = concat(kept);
  const head = new Uint8Array(12);
  head.set(encodeAscii('RIFF'), 0);
  putU32le(head, 4, 4 + body.length);
  head.set(encodeAscii('WEBP'), 8);
  return { bytes: concat([head, body]), removed, retained: [], notes };
}
