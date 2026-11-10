import { concat, crc32, encodeAscii, inflate, latin1, putU32be, startsWith, u32be, utf8 } from './bytes.js';
import { Collector } from './collect.js';
import { buildTiff, EXIF_HEADER, parseTiff, tiffCategories } from './exif.js';
import type { FormatStrip } from './jpeg.js';
import { analyzeIrb } from './iptc.js';
import type { Category } from './types.js';
import { analyzeXmp } from './xmp.js';

export const PNG_SIG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

export function isPng(b: Uint8Array): boolean {
  return b.length >= 8 && PNG_SIG.every((v, i) => b[i] === v);
}

interface Chunk {
  type: string;
  start: number;
  end: number;
  data: Uint8Array;
}

function chunks(b: Uint8Array): Chunk[] {
  const out: Chunk[] = [];
  let p = 8;
  while (p + 12 <= b.length) {
    const len = u32be(b, p);
    const type = latin1(b, p + 4, p + 8);
    const end = p + 12 + len;
    if (end > b.length) throw new Error('Corrupt PNG: chunk runs past the end of the file');
    out.push({ type, start: p, end, data: b.subarray(p + 8, p + 8 + len) });
    p = end;
    if (type === 'IEND') break;
  }
  return out;
}

/** Text keywords written by image generators (Automatic1111, ComfyUI, InvokeAI, NovelAI, Midjourney exports). */
const AI_KEYS = /^(parameters|prompt|workflow|negative_prompt|sd-metadata|invokeai_metadata|invokeai_graph|dream|generation_data|comfy.*|novelai.*|ai_metadata|aigc)$/i;

function textCategory(key: string): Category {
  if (AI_KEYS.test(key)) return 'ai';
  const k = key.toLowerCase();
  if (k === 'author' || k === 'copyright' || k === 'artist') return 'author';
  if (k === 'title' || k === 'description' || k === 'comment' || k === 'disclaimer' || k === 'warning' || k === 'keywords') return 'descriptions';
  if (k === 'software') return 'software';
  if (k === 'creation time' || k === 'date:create' || k === 'date:modify' || k === 'date:timestamp') return 'time';
  if (k === 'source') return 'device';
  return 'other';
}

interface TextChunk {
  key: string;
  text: string;
}

async function readText(c: Chunk): Promise<TextChunk | null> {
  const d = c.data;
  const nul = d.indexOf(0);
  if (nul < 0) return null;
  const key = latin1(d, 0, nul);
  try {
    if (c.type === 'tEXt') return { key, text: latin1(d, nul + 1) };
    if (c.type === 'zTXt') return { key, text: latin1(await inflate(d.subarray(nul + 2))) };
    if (c.type === 'iTXt') {
      const compressed = d[nul + 1] === 1;
      let p = nul + 3;
      const langEnd = d.indexOf(0, p);
      p = langEnd + 1;
      const transEnd = d.indexOf(0, p);
      p = transEnd + 1;
      const body = d.subarray(p);
      return { key, text: utf8(compressed ? await inflate(body) : body) };
    }
  } catch {
    return { key, text: '' };
  }
  return null;
}

/** ImageMagick stores EXIF/XMP/IPTC as hex in "Raw profile type …" text chunks. */
function rawProfile(text: string): Uint8Array | null {
  const m = /^\s*\S+\s+(\d+)\s+([\s\S]*)$/.exec(text);
  if (!m) return null;
  const hex = m[2].replace(/[^0-9a-f]/gi, '');
  const n = Math.min(Number(m[1]), hex.length >> 1);
  const out = new Uint8Array(n);
  for (let i = 0; i < n; i++) out[i] = parseInt(hex.substr(i * 2, 2), 16);
  return out;
}

function tiffFromExifProfile(bytes: Uint8Array): Uint8Array {
  return startsWith(bytes, 0, 'Exif\0\0') ? bytes.subarray(6) : bytes;
}

const TEXT_TYPES = new Set(['tEXt', 'zTXt', 'iTXt']);

export async function inspectPng(b: Uint8Array, c: Collector): Promise<void> {
  for (const ch of chunks(b)) {
    if (ch.type === 'IHDR' && ch.data.length >= 8) {
      c.report.width = u32be(ch.data, 0);
      c.report.height = u32be(ch.data, 4);
    } else if (ch.type === 'eXIf') {
      c.tiff(tiffFromExifProfile(ch.data), 'exif');
    } else if (ch.type === 'tIME') {
      const d = ch.data;
      const v = `${(d[0] << 8) | d[1]}-${String(d[2]).padStart(2, '0')}-${String(d[3]).padStart(2, '0')} ${String(d[4]).padStart(2, '0')}:${String(d[5]).padStart(2, '0')}:${String(d[6]).padStart(2, '0')} UTC`;
      c.add({ category: 'time', source: 'png', key: 'png.tIME', label: 'Last modified', value: v, removable: true });
    } else if (ch.type === 'caBX') {
      c.add({ category: 'provenance', source: 'png', key: 'png.caBX', label: 'Content credentials (C2PA)', value: `${ch.data.length.toLocaleString('en')} bytes`, removable: true });
    } else if (TEXT_TYPES.has(ch.type)) {
      const t = await readText(ch);
      if (!t) continue;
      if (t.key === 'XML:com.adobe.xmp') c.xmp(t.text, 'xmp');
      else if (/^Raw profile type (exif|APP1)$/i.test(t.key)) {
        const raw = rawProfile(t.text);
        if (raw) {
          if (startsWith(raw, 0, 'Exif\0\0') || raw[0] === 0x49 || raw[0] === 0x4d) c.tiff(tiffFromExifProfile(raw), 'exif');
          else c.xmp(raw, 'xmp');
        }
      } else if (/^Raw profile type xmp$/i.test(t.key)) {
        const raw = rawProfile(t.text);
        if (raw) c.xmp(raw, 'xmp');
      } else if (/^Raw profile type (iptc|8bim)$/i.test(t.key)) {
        const raw = rawProfile(t.text);
        if (raw) c.irb(raw, 'iptc');
      } else if (/^Raw profile type icc$/i.test(t.key)) {
        // colour profile: technical, keep
      } else {
        const cat = textCategory(t.key);
        const value = t.text.length > 2000 ? t.text.slice(0, 2000) + '…' : t.text;
        c.add({ category: cat, source: 'png', key: `png.text.${t.key}`, label: cat === 'ai' ? `AI generator data "${t.key}"` : `Text "${t.key}"`, value, removable: true });
        if (cat === 'ai' && !c.report.summary.aiPrompt) c.report.summary.aiPrompt = value;
        if (cat === 'author') c.report.summary.names.push(t.text);
        if (cat === 'software') c.report.summary.software.push(t.text);
      }
    } else if (/^[a-z]/.test(ch.type) && !KNOWN_ANCILLARY.has(ch.type)) {
      c.add({ category: 'other', source: 'png', key: `png.${ch.type}`, label: `Private chunk "${ch.type}"`, value: `${ch.data.length.toLocaleString('en')} bytes`, removable: true });
    }
  }
}

/** Ancillary chunks that only affect how pixels are displayed. */
const KNOWN_ANCILLARY = new Set(['tRNS', 'gAMA', 'cHRM', 'sRGB', 'iCCP', 'sBIT', 'bKGD', 'hIST', 'pHYs', 'sPLT', 'acTL', 'fcTL', 'fdAT', 'cICP', 'mDCv', 'cLLi', 'oFFs', 'pCAL', 'sCAL', 'sTER', 'gIFg', 'gIFx', 'vpAg', 'iDOT', 'gdAT', 'gmAP']);

function makeChunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  putU32be(out, 0, data.length);
  out.set(encodeAscii(type), 4);
  out.set(data, 8);
  putU32be(out, 8 + data.length, crc32(out, 4, 8 + data.length));
  return out;
}

export async function stripPng(b: Uint8Array, remove: Set<Category>): Promise<FormatStrip> {
  const removed = new Set<Category>();
  const notes: string[] = [];
  const parts: Uint8Array[] = [b.subarray(0, 8)];
  const dropWhole = (cats: Iterable<Category>): boolean => {
    const hits = [...cats].filter((c) => remove.has(c));
    hits.forEach((c) => removed.add(c));
    return hits.length > 0;
  };
  for (const ch of chunks(b)) {
    const raw = b.subarray(ch.start, ch.end);
    if (ch.type === 'eXIf') {
      const tiff = parseTiff(tiffFromExifProfile(ch.data));
      if (!tiff) {
        if (!dropWhole(['other'])) parts.push(raw);
        continue;
      }
      if (![...tiffCategories(tiff)].some((c) => remove.has(c))) {
        parts.push(raw);
        continue;
      }
      const r = buildTiff(tiff, { remove });
      r.removed.forEach((c) => removed.add(c));
      notes.push(...r.notes);
      if (r.bytes) parts.push(makeChunk('eXIf', r.bytes));
    } else if (ch.type === 'tIME') {
      if (!dropWhole(['time'])) parts.push(raw);
    } else if (ch.type === 'caBX') {
      if (!dropWhole(['provenance'])) parts.push(raw);
    } else if (TEXT_TYPES.has(ch.type)) {
      const t = await readText(ch);
      if (!t) {
        if (!dropWhole(['other'])) parts.push(raw);
        continue;
      }
      let cats: Set<Category>;
      if (t.key === 'XML:com.adobe.xmp') cats = analyzeXmp(t.text).categories;
      else if (/^Raw profile type (exif|APP1)$/i.test(t.key)) {
        const raw2 = rawProfile(t.text);
        const tiff = raw2 ? parseTiff(tiffFromExifProfile(raw2)) : null;
        cats = tiff ? tiffCategories(tiff) : raw2 ? analyzeXmp(utf8(raw2)).categories : new Set(['other']);
      } else if (/^Raw profile type xmp$/i.test(t.key)) {
        const raw2 = rawProfile(t.text);
        cats = raw2 ? analyzeXmp(utf8(raw2)).categories : new Set(['other']);
      } else if (/^Raw profile type (iptc|8bim)$/i.test(t.key)) {
        const raw2 = rawProfile(t.text);
        cats = raw2 ? analyzeIrb(raw2, 'iptc').categories : new Set(['other']);
      } else if (/^Raw profile type icc$/i.test(t.key)) cats = new Set();
      else cats = new Set([textCategory(t.key)]);
      if (cats.size && dropWhole(cats)) {
        if (t.key.startsWith('XML:') || t.key.startsWith('Raw profile')) notes.push(`The "${t.key}" block was removed as a whole.`);
        continue;
      }
      parts.push(raw);
    } else if (/^[a-z]/.test(ch.type) && !KNOWN_ANCILLARY.has(ch.type)) {
      if (!dropWhole(['other'])) parts.push(raw);
    } else parts.push(raw);
  }
  return { bytes: concat(parts), removed, retained: [], notes: [...new Set(notes)] };
}

/** Insert an eXIf chunk right after IHDR (used after re-encoding). */
export function insertPngExif(png: Uint8Array, tiff: Uint8Array): Uint8Array {
  const all = chunks(png);
  const ihdr = all.find((c) => c.type === 'IHDR');
  if (!ihdr) return png;
  return concat([png.subarray(0, ihdr.end), makeChunk('eXIf', tiff), png.subarray(ihdr.end)]);
}

