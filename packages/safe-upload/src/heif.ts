import { latin1, u16be, u32be, u64be } from './bytes.js';
import { Collector } from './collect.js';
import { buildTiff, parseTiff, tiffCategories } from './exif.js';
import type { FormatStrip } from './jpeg.js';
import type { Category, Finding, Format } from './types.js';
import { analyzeXmp, emptyXmpPacket } from './xmp.js';

interface Box {
  type: string;
  start: number;
  /** Offset of the box payload (after size/type/largesize). */
  body: number;
  end: number;
}

function boxes(b: Uint8Array, from: number, to: number): Box[] {
  const out: Box[] = [];
  let p = from;
  while (p + 8 <= to) {
    let size = u32be(b, p);
    const type = latin1(b, p + 4, p + 8);
    let body = p + 8;
    if (size === 1) {
      if (p + 16 > to) break;
      size = u64be(b, p + 8);
      body = p + 16;
    } else if (size === 0) size = to - p;
    if (size < 8 || p + size > to) break;
    out.push({ type, start: p, body, end: p + size });
    p += size;
  }
  return out;
}

const HEIC_BRANDS = new Set(['heic', 'heix', 'heim', 'heis', 'hevc', 'hevx', 'mif1', 'msf1', 'mif2', 'MiHE', 'MiHB']);

export function heifFormat(b: Uint8Array): Format | null {
  if (b.length < 16 || latin1(b, 4, 8) !== 'ftyp') return null;
  const size = Math.min(u32be(b, 0), b.length);
  const brands: string[] = [latin1(b, 8, 12)];
  for (let p = 16; p + 4 <= size; p += 4) brands.push(latin1(b, p, p + 4));
  if (brands.some((x) => x === 'avif' || x === 'avis')) return 'avif';
  if (brands.some((x) => HEIC_BRANDS.has(x))) return 'heic';
  return null;
}

interface Item {
  id: number;
  type: string;
  name: string;
  contentType?: string;
  extents: { offset: number; length: number }[];
}

interface Heif {
  items: Map<number, Item>;
  primary?: number;
  refs: { type: string; from: number; to: number[] }[];
  props: { type: string; data: Uint8Array }[];
  assoc: Map<number, number[]>;
}

function parseHeif(b: Uint8Array): Heif {
  const top = boxes(b, 0, b.length);
  const meta = top.find((x) => x.type === 'meta');
  if (!meta) throw new Error('HEIF file has no meta box');
  const kids = boxes(b, meta.body + 4, meta.end);
  const h: Heif = { items: new Map(), refs: [], props: [], assoc: new Map() };
  let idat: Box | undefined;
  for (const k of kids) {
    if (k.type === 'pitm') {
      const v = b[k.body];
      h.primary = v === 0 ? u16be(b, k.body + 4) : u32be(b, k.body + 4);
    } else if (k.type === 'idat') idat = k;
    else if (k.type === 'iinf') {
      const v = b[k.body];
      const start = k.body + 4 + (v === 0 ? 2 : 4);
      for (const infe of boxes(b, start, k.end)) {
        if (infe.type !== 'infe') continue;
        const iv = b[infe.body];
        if (iv < 2) continue;
        let p = infe.body + 4;
        const id = iv === 2 ? u16be(b, p) : u32be(b, p);
        p += iv === 2 ? 2 : 4;
        p += 2; // protection index
        const type = latin1(b, p, p + 4);
        p += 4;
        const nameEnd = b.indexOf(0, p);
        const name = latin1(b, p, nameEnd < 0 || nameEnd > infe.end ? infe.end : nameEnd);
        p = nameEnd + 1;
        let contentType: string | undefined;
        if (type === 'mime' && p < infe.end) {
          const ce = b.indexOf(0, p);
          contentType = latin1(b, p, ce < 0 || ce > infe.end ? infe.end : ce);
        }
        h.items.set(id, { id, type, name, contentType, extents: [] });
      }
    } else if (k.type === 'iref') {
      const v = b[k.body];
      const idSize = v === 0 ? 2 : 4;
      for (const r of boxes(b, k.body + 4, k.end)) {
        let p = r.body;
        const rd = (q: number) => (idSize === 2 ? u16be(b, q) : u32be(b, q));
        const from = rd(p);
        p += idSize;
        const n = u16be(b, p);
        p += 2;
        const to: number[] = [];
        for (let i = 0; i < n && p + idSize <= r.end; i++, p += idSize) to.push(rd(p));
        h.refs.push({ type: r.type, from, to });
      }
    } else if (k.type === 'iprp') {
      for (const c of boxes(b, k.body, k.end)) {
        if (c.type === 'ipco') for (const prop of boxes(b, c.body, c.end)) h.props.push({ type: prop.type, data: b.subarray(prop.body, prop.end) });
        else if (c.type === 'ipma') {
          const v = b[c.body];
          const flags = (b[c.body + 1] << 16) | (b[c.body + 2] << 8) | b[c.body + 3];
          let p = c.body + 4;
          const count = u32be(b, p);
          p += 4;
          for (let i = 0; i < count && p < c.end; i++) {
            const id = v < 1 ? u16be(b, p) : u32be(b, p);
            p += v < 1 ? 2 : 4;
            const n = b[p++];
            const list: number[] = [];
            for (let j = 0; j < n; j++) {
              if (flags & 1) {
                list.push(u16be(b, p) & 0x7fff);
                p += 2;
              } else list.push(b[p++] & 0x7f);
            }
            h.assoc.set(id, list);
          }
        }
      }
    }
  }
  const iloc = kids.find((x) => x.type === 'iloc');
  if (iloc) {
    const v = b[iloc.body];
    let p = iloc.body + 4;
    const offsetSize = b[p] >> 4;
    const lengthSize = b[p] & 15;
    const baseSize = b[p + 1] >> 4;
    const indexSize = v === 1 || v === 2 ? b[p + 1] & 15 : 0;
    p += 2;
    const rdN = (n: number) => {
      const val = n === 0 ? 0 : n === 4 ? u32be(b, p) : n === 8 ? u64be(b, p) : n === 2 ? u16be(b, p) : 0;
      p += n;
      return val;
    };
    const count = v < 2 ? u16be(b, p) : u32be(b, p);
    p += v < 2 ? 2 : 4;
    for (let i = 0; i < count && p < iloc.end; i++) {
      const id = v < 2 ? u16be(b, p) : u32be(b, p);
      p += v < 2 ? 2 : 4;
      let method = 0;
      if (v === 1 || v === 2) {
        method = u16be(b, p) & 15;
        p += 2;
      }
      p += 2; // data reference index
      const base = rdN(baseSize);
      const ext = u16be(b, p);
      p += 2;
      const extents: { offset: number; length: number }[] = [];
      for (let e = 0; e < ext; e++) {
        rdN(indexSize);
        const off = rdN(offsetSize);
        const len = rdN(lengthSize);
        const fileBase = method === 1 && idat ? idat.body : 0;
        if (method === 0 || method === 1) extents.push({ offset: fileBase + base + off, length: len });
      }
      const item = h.items.get(id);
      if (item) item.extents = extents;
    }
  }
  return h;
}

function itemBytes(b: Uint8Array, item: Item): Uint8Array {
  if (item.extents.length === 1) {
    const e = item.extents[0];
    return b.subarray(e.offset, Math.min(b.length, e.offset + e.length));
  }
  const total = item.extents.reduce((s, e) => s + e.length, 0);
  const out = new Uint8Array(total);
  let o = 0;
  for (const e of item.extents) {
    out.set(b.subarray(e.offset, e.offset + e.length), o);
    o += e.length;
  }
  return out;
}

function writeItem(out: Uint8Array, item: Item, data: Uint8Array): void {
  let o = 0;
  for (const e of item.extents) {
    out.set(data.subarray(o, o + e.length), e.offset);
    o += e.length;
  }
}

function auxType(h: Heif, id: number): string | undefined {
  for (const idx of h.assoc.get(id) ?? []) {
    const prop = h.props[idx - 1];
    if (prop?.type === 'auxC') {
      const d = prop.data;
      const end = d.indexOf(0, 4);
      return latin1(d, 4, end < 0 ? d.length : end);
    }
  }
  return undefined;
}

function isXmpItem(i: Item): boolean {
  return i.type === 'mime' && /rdf\+xml|xmp/i.test(i.contentType ?? '');
}

interface Extra {
  finding: Omit<Finding, 'source' | 'removable'>;
}

function extras(h: Heif): Extra[] {
  const out: Extra[] = [];
  const thumbs = h.refs.filter((r) => r.type === 'thmb');
  if (thumbs.length) out.push({ finding: { category: 'thumbnail', key: 'heif.thumbnail', label: 'Embedded thumbnail image', value: `${thumbs.length} preview image${thumbs.length > 1 ? 's' : ''}` } });
  for (const r of h.refs.filter((x) => x.type === 'auxl')) {
    const t = auxType(h, r.from) ?? '';
    if (/alpha/i.test(t)) continue;
    const label = /depth/i.test(t)
      ? 'Depth map'
      : /gainmap|gain-map|hdrgainmap/i.test(t)
        ? 'HDR gain map'
        : /matte/i.test(t)
          ? 'Portrait matte (person or skin mask)'
          : 'Auxiliary image';
    out.push({ finding: { category: 'hidden', key: `heif.aux.${r.from}`, label, value: t || 'auxiliary image' } });
  }
  for (const i of h.items.values()) if (i.type === 'tmap') out.push({ finding: { category: 'hidden', key: `heif.tmap.${i.id}`, label: 'HDR tone map image', value: 'ISO 21496 gain map' } });
  return out;
}

export function inspectHeif(b: Uint8Array, c: Collector): void {
  const h = parseHeif(b);
  // Primary image size from its ispe property
  if (h.primary !== undefined) {
    for (const idx of h.assoc.get(h.primary) ?? []) {
      const prop = h.props[idx - 1];
      if (prop?.type === 'ispe' && prop.data.length >= 12) {
        c.report.width = u32be(prop.data, 4);
        c.report.height = u32be(prop.data, 8);
      }
    }
  }
  for (const item of h.items.values()) {
    if (item.type === 'Exif' && item.extents.length) {
      const d = itemBytes(b, item);
      const skip = u32be(d, 0);
      c.tiff(d.subarray(4 + skip), 'exif');
    } else if (isXmpItem(item) && item.extents.length) c.xmp(itemBytes(b, item), 'xmp');
  }
  for (const e of extras(h)) c.add({ ...e.finding, source: 'heif', removable: false });
  if (extras(h).length) c.note('HEIC/AVIF embedded thumbnails and auxiliary images cannot be removed without converting the photo.');
}

const EMPTY_TIFF = new Uint8Array([0x4d, 0x4d, 0x00, 0x2a, 0x00, 0x00, 0x00, 0x08, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);

export function stripHeif(b: Uint8Array, remove: Set<Category>): FormatStrip {
  const h = parseHeif(b);
  const out = b.slice();
  const removed = new Set<Category>();
  const notes: string[] = [];
  for (const item of h.items.values()) {
    if (!item.extents.length) continue;
    const d = itemBytes(b, item);
    if (item.type === 'Exif') {
      const skip = u32be(d, 0);
      const tiffStart = 4 + skip;
      const tiff = parseTiff(d.subarray(tiffStart));
      if (!tiff || ![...tiffCategories(tiff)].some((c) => remove.has(c))) continue;
      const r = buildTiff(tiff, { remove });
      r.removed.forEach((c) => removed.add(c));
      notes.push(...r.notes);
      const newTiff = r.bytes ?? EMPTY_TIFF;
      const replacement = new Uint8Array(d.length);
      replacement.set(d.subarray(0, tiffStart), 0);
      if (tiffStart + newTiff.length > d.length) throw new Error('Rewritten EXIF does not fit in place');
      replacement.set(newTiff, tiffStart);
      writeItem(out, item, replacement);
    } else if (isXmpItem(item)) {
      const hits = [...analyzeXmp(new TextDecoder().decode(d)).categories].filter((c) => remove.has(c));
      if (!hits.length) continue;
      hits.forEach((c) => removed.add(c));
      writeItem(out, item, emptyXmpPacket(d.length));
      notes.push('The XMP metadata block was emptied as a whole.');
    }
  }
  const retained: Finding[] = [];
  for (const e of extras(h)) if (remove.has(e.finding.category)) retained.push({ ...e.finding, source: 'heif', removable: false });
  if (retained.length) notes.push('Embedded previews and auxiliary images in HEIC/AVIF stay in place; convert the photo to remove them.');
  return { bytes: out, removed, retained, notes };
}
